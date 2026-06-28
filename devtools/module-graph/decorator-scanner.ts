import path from "node:path";
import {
	type Node as MorphNode,
	Node,
	Project,
	type SourceFile,
	SyntaxKind,
} from "ts-morph";

// The http decorators are framework-owned and bound to HTTP_DECORATOR_STATE_TOKEN,
// but they can't be recovered from source the way cron/rabbit decorators can: the
// route verbs are produced by the createRouteDecorator factory, so they have no
// statically-named declaration to scan. They're stable, so the catalog is listed
// here and seeded onto any initializer class whose `token` field references the
// http token const below.
const HTTP_DECORATOR_STATE_TOKEN_NAME = "HTTP_DECORATOR_STATE_TOKEN";
const HTTP_DECORATOR_NAMES: readonly string[] = [
	"GET",
	"POST",
	"PUT",
	"DELETE",
	"PATCH",
	"controller",
	"before",
	"after",
	"schema",
];

// Statically finds the decorators that work with each interceptor/initializer,
// so the graph can show "available" decorators even when none have been applied
// yet. Keyed by class name (not the registration key), because the decorator
// state description can differ from it — e.g. the cron decorator uses
// createDecoratorStateUpdater("Cron Jobs") while the module exports it as
// "cron". The stable link is the interceptor/initializer class's `token` field:
//   createDecoratorStateUpdater("…") -> updater
//   export const X_TOKEN = updater.token
//   class CronInitializer { token = X_TOKEN }   ← joined on class name
//   export function cron(...) { updater.update(...) }   ← the decorator
//
// Result is cached — decorator definitions don't change during a session, and
// building the ts-morph project is expensive. Returns {} when source/tsconfig
// isn't available (e.g. a built deployment), degrading gracefully.
export class DecoratorScanner {
	private cache: Record<string, string[]> | null = null;
	private readonly cwd = path.resolve(process.cwd());

	getDecoratorNamesByClassName(): Record<string, string[]> {
		if (this.cache) return this.cache;

		try {
			const project = new Project({
				tsConfigFilePath: path.resolve(this.cwd, "tsconfig.json"),
			});
			this.cache = this.scan(project);
		} catch {
			this.cache = {};
		}

		return this.cache;
	}

	private scan(project: Project): Record<string, string[]> {
		// token const name (e.g. "CRON_METADATA_TOKEN") -> decorator names.
		const decoratorNamesByToken = new Map<string, Set<string>>();

		for (const sourceFile of project.getSourceFiles()) {
			for (const call of sourceFile.getDescendantsOfKind(
				SyntaxKind.CallExpression,
			)) {
				if (call.getExpression().getText() !== "createDecoratorStateUpdater") {
					continue;
				}

				const updaterName = call
					.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)
					?.getName();
				if (!updaterName) continue;

				const decoratorNames = this.findDecoratorNames(sourceFile, updaterName);
				if (decoratorNames.length === 0) continue;

				for (const tokenName of this.findTokenConstNames(
					sourceFile,
					updaterName,
				)) {
					const names =
						decoratorNamesByToken.get(tokenName) ?? new Set<string>();
					for (const name of decoratorNames) names.add(name);
					decoratorNamesByToken.set(tokenName, names);
				}
			}
		}

		// Seed the http catalog: its verbs come from a factory and can't be scanned
		// by name, so join the known set onto the http token const directly.
		const httpNames =
			decoratorNamesByToken.get(HTTP_DECORATOR_STATE_TOKEN_NAME) ??
			new Set<string>();
		for (const name of HTTP_DECORATOR_NAMES) httpNames.add(name);
		decoratorNamesByToken.set(HTTP_DECORATOR_STATE_TOKEN_NAME, httpNames);

		// Classes whose `token` field references one of those token consts.
		const byClassName: Record<string, Set<string>> = {};

		for (const sourceFile of project.getSourceFiles()) {
			for (const classDeclaration of sourceFile.getClasses()) {
				const className = classDeclaration.getName();
				const tokenReference = classDeclaration
					.getProperty("token")
					?.getInitializer()
					?.getText();
				if (!className || !tokenReference) continue;

				const names = decoratorNamesByToken.get(tokenReference);
				if (!names) continue;

				if (!byClassName[className]) byClassName[className] = new Set();
				for (const name of names) byClassName[className].add(name);
			}
		}

		return Object.fromEntries(
			Object.entries(byClassName).map(([className, names]) => [
				className,
				[...names],
			]),
		);
	}

	// Names of top-level declarations whose body calls `<updaterName>.update` —
	// i.e. the decorators registered against this updater.
	private findDecoratorNames(
		sourceFile: SourceFile,
		updaterName: string,
	): string[] {
		const names = new Set<string>();

		for (const access of sourceFile.getDescendantsOfKind(
			SyntaxKind.PropertyAccessExpression,
		)) {
			if (access.getName() !== "update") continue;
			if (access.getExpression().getText() !== updaterName) continue;

			const name = this.getEnclosingDeclarationName(access);
			if (name) names.add(name);
		}

		return [...names];
	}

	// Names of const declarations assigned `<updaterName>.token`
	// (e.g. `export const CRON_METADATA_TOKEN = updater.token`).
	private findTokenConstNames(
		sourceFile: SourceFile,
		updaterName: string,
	): string[] {
		return sourceFile
			.getVariableDeclarations()
			.filter((declaration) => {
				const initializer = declaration.getInitializer();
				return (
					initializer !== undefined &&
					Node.isPropertyAccessExpression(initializer) &&
					initializer.getName() === "token" &&
					initializer.getExpression().getText() === updaterName
				);
			})
			.map((declaration) => declaration.getName());
	}

	private getEnclosingDeclarationName(node: MorphNode): string | undefined {
		let name: string | undefined;
		let current = node.getParent();

		// Walk to the source file, keeping the outermost named function/const —
		// e.g. skip a nested `decorate` helper and keep the exported `Cachable`.
		while (current && !Node.isSourceFile(current)) {
			if (Node.isFunctionDeclaration(current) && current.getName()) {
				name = current.getName();
			} else if (Node.isVariableDeclaration(current)) {
				name = current.getName();
			}
			current = current.getParent();
		}

		return name;
	}
}
