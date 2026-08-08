import {
	type ClassDeclaration,
	type Expression,
	type Node as MorphNode,
	Node,
	type ObjectLiteralExpression,
	type Project,
	type PropertyAssignment,
	type ShorthandPropertyAssignment,
	type SourceFile,
	SyntaxKind,
	type TypeNode,
} from "ts-morph";
import type { GitChanges } from "./git-changes.js";
import type { ModuleProviderSnapshot, ProviderRecord } from "./types.js";

export class ProviderScanner {
	constructor(private readonly gitChanges: GitChanges) {}

	collectProviders(project: Project, cwd: string): ProviderRecord[] {
		const providers: ProviderRecord[] = [];

		for (const sourceFile of project.getSourceFiles()) {
			for (const call of sourceFile.getDescendantsOfKind(
				SyntaxKind.CallExpression,
			)) {
				const moduleObject = call.getArguments()[0];
				if (!this.isModuleObject(moduleObject)) continue;

				const moduleName = this.getStringProperty(moduleObject, "name");
				const providersObject = this.getObjectProperty(
					moduleObject,
					"providers",
				);
				if (!moduleName || !providersObject) continue;

				for (const property of providersObject.getProperties()) {
					if (
						!Node.isPropertyAssignment(property) &&
						!Node.isShorthandPropertyAssignment(property)
					) {
						continue;
					}

					const provider = this.getPropertyName(property);
					if (!provider) continue;

					const initializer = Node.isPropertyAssignment(property)
						? property.getInitializer()
						: property.getNameNode();
					const classNode = initializer
						? this.getProviderClassNode(initializer)
						: undefined;

					providers.push({
						className: classNode?.getName(),
						deps: initializer
							? this.getProviderDeps(initializer, classNode)
							: [],
						moduleName,
						moduleFile: this.gitChanges.toRelativePath(
							cwd,
							sourceFile.getFilePath(),
						),
						moduleProviderLine: property.getStartLineNumber(),
						provider,
						sourceFile: this.gitChanges.toRelativePath(
							cwd,
							classNode?.getSourceFile().getFilePath() ??
								sourceFile.getFilePath(),
						),
					});
				}
			}
		}

		return providers;
	}

	collectModuleProviderSnapshots(
		project: Project,
		cwd: string,
	): ModuleProviderSnapshot[] {
		return project
			.getSourceFiles()
			.flatMap((sourceFile) =>
				this.collectModuleProviderSnapshotsFromSourceFile(
					sourceFile,
					this.gitChanges.toRelativePath(cwd, sourceFile.getFilePath()),
				),
			);
	}

	collectModuleProviderSnapshotsFromSourceFile(
		sourceFile: SourceFile,
		file: string,
	): ModuleProviderSnapshot[] {
		const snapshots: ModuleProviderSnapshot[] = [];

		for (const call of sourceFile.getDescendantsOfKind(
			SyntaxKind.CallExpression,
		)) {
			const moduleObject = call.getArguments()[0];
			if (!this.isModuleObject(moduleObject)) continue;

			const moduleName = this.getStringProperty(moduleObject, "name");
			const providersObject = this.getObjectProperty(moduleObject, "providers");
			if (!moduleName || !providersObject) continue;

			snapshots.push({
				file,
				moduleName,
				providers: new Set(this.getProviderNames(providersObject)),
			});
		}

		return snapshots;
	}

	private isModuleObject(
		node: MorphNode | undefined,
	): node is ObjectLiteralExpression {
		return (
			Boolean(node) &&
			Node.isObjectLiteralExpression(node) &&
			typeof this.getStringProperty(node, "name") === "string" &&
			Boolean(this.getObjectProperty(node, "providers"))
		);
	}

	private getProviderNames(providersObject: ObjectLiteralExpression): string[] {
		return providersObject.getProperties().flatMap((property) => {
			if (
				!Node.isPropertyAssignment(property) &&
				!Node.isShorthandPropertyAssignment(property)
			) {
				return [];
			}

			const name = this.getPropertyName(property);
			return name ? [name] : [];
		});
	}

	private getProviderClassNode(
		initializer: Expression,
	): ClassDeclaration | undefined {
		if (Node.isObjectLiteralExpression(initializer)) {
			const useClass = this.getPropertyInitializer(initializer, "useClass");
			return useClass ? this.resolveDeclaration(useClass) : undefined;
		}

		return this.resolveDeclaration(initializer);
	}

	private resolveDeclaration(node: MorphNode): ClassDeclaration | undefined {
		if (!Node.isIdentifier(node)) return undefined;

		const symbol = node.getSymbol();
		const declarations = [
			...(symbol?.getDeclarations() ?? []),
			...(symbol?.getAliasedSymbol()?.getDeclarations() ?? []),
		];

		return declarations.find(Node.isClassDeclaration);
	}

	private getProviderDeps(
		initializer: Expression,
		classNode: ClassDeclaration | undefined,
	): string[] {
		const deps = new Set<string>();

		if (Node.isObjectLiteralExpression(initializer)) {
			const inject = this.getPropertyInitializer(initializer, "inject");

			if (inject && Node.isArrayLiteralExpression(inject)) {
				for (const element of inject.getElements()) {
					if (Node.isStringLiteral(element)) deps.add(element.getLiteralText());
				}
			}
		}

		const classConstructor = classNode?.getConstructors()[0];
		for (const parameter of classConstructor?.getParameters() ?? []) {
			const dep = this.getDepFromTypeNode(parameter.getTypeNode());
			if (dep) deps.add(dep);
		}

		return [...deps];
	}

	private getDepFromTypeNode(typeNode: TypeNode | undefined): string | null {
		if (!typeNode) return null;

		if (Node.isIndexedAccessTypeNode(typeNode)) {
			const indexType = typeNode.getIndexTypeNode();
			if (Node.isLiteralTypeNode(indexType)) {
				const literal = indexType.getLiteral();
				if (Node.isStringLiteral(literal)) return literal.getLiteralText();
			}
		}

		const className = typeNode.getType().getSymbol()?.getName();

		return className ? this.lowerFirst(className) : null;
	}

	private getObjectProperty(
		object: ObjectLiteralExpression,
		name: string,
	): ObjectLiteralExpression | undefined {
		const initializer = this.getPropertyInitializer(object, name);
		return initializer && Node.isObjectLiteralExpression(initializer)
			? initializer
			: undefined;
	}

	private getStringProperty(
		object: ObjectLiteralExpression,
		name: string,
	): string | null {
		const property = object.getProperty(name);
		const initializer = Node.isPropertyAssignment(property)
			? property.getInitializer()
			: undefined;

		return initializer && Node.isStringLiteral(initializer)
			? initializer.getLiteralText()
			: null;
	}

	private getPropertyInitializer(
		object: ObjectLiteralExpression,
		name: string,
	): Expression | undefined {
		const property = object.getProperty(name);

		return property && Node.isPropertyAssignment(property)
			? property.getInitializer()
			: undefined;
	}

	private getPropertyName(
		property: PropertyAssignment | ShorthandPropertyAssignment,
	): string | null {
		return (
			property
				.getNameNode()
				.getText()
				.replace(/^["']|["']$/g, "") ?? null
		);
	}

	private lowerFirst(value: string): string {
		return `${value.charAt(0).toLowerCase()}${value.slice(1)}`;
	}
}
