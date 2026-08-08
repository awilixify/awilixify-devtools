import path from "node:path";
import { Project } from "ts-morph";

import type { Deps } from "../devtools.module.js";
import type { ProviderImpact, ProviderImpactItem } from "../dtos/index.js";
import type { FileChanges } from "./git-changes.js";
import { GitChanges } from "./git-changes.js";
import { ProviderScanner } from "./provider-scanner.js";
import type { ProviderRecord } from "./types.js";

type ProviderImpactAnalysisContext = {
	changedLineRangesByFile: Map<string, Array<[number, number]>>;
	fileChanges: FileChanges;
	moduleIdByName: Map<string, string>;
};

export class ProviderImpactAnalyzer {
	private readonly cwd: string;

	constructor(
		private readonly graphCollector: Deps["graphCollector"],
		private readonly gitChanges = new GitChanges(),
		private readonly providerScanner = new ProviderScanner(gitChanges),
	) {
		this.cwd = path.resolve(process.cwd());
	}

	async analyze(): Promise<ProviderImpact> {
		// ts-morph sees current AST; git tells us file status, deletions, and changed line ranges.
		const fileChanges = this.gitChanges.getFileChanges(this.cwd);

		if (
			fileChanges.changedFiles.length === 0 &&
			fileChanges.deletedFiles.length === 0 &&
			fileChanges.newFiles.length === 0
		) {
			return {
				changedFiles: fileChanges.changedFiles,
				deletedFiles: fileChanges.deletedFiles,
				newFiles: fileChanges.newFiles,
				changedProviders: [],
				deletedProviders: [],
				newProviders: [],
				affectedProviders: [],
			};
		}

		const project = new Project({
			tsConfigFilePath: path.resolve(this.cwd, "tsconfig.json"),
		});
		const providers = this.providerScanner.collectProviders(project, this.cwd);
		const context = this.createAnalysisContext(fileChanges);

		const deletedProviders = this.getDeletedProviders(project, context);
		const newProviders = this.getNewProviders(providers, context);
		const changedProviders = this.getChangedProviders(
			providers,
			context,
			new Set(newProviders.map((provider) => provider.provider)),
			new Set(deletedProviders.map((provider) => provider.provider)),
		);
		const affectedProviders = this.getAffectedProviders(
			[...deletedProviders, ...newProviders, ...changedProviders].map(
				(el) => el.provider,
			),
			providers,
		);

		return {
			changedFiles: fileChanges.changedFiles,
			deletedFiles: fileChanges.deletedFiles,
			newFiles: fileChanges.newFiles,
			changedProviders: this.toImpactItems(changedProviders, context),
			deletedProviders: this.toImpactItems(deletedProviders, context),
			newProviders: this.toImpactItems(newProviders, context),
			affectedProviders: this.toImpactItems(affectedProviders, context),
		};
	}

	private createAnalysisContext(
		fileChanges: FileChanges,
	): ProviderImpactAnalysisContext {
		return {
			changedLineRangesByFile: this.gitChanges.getChangedLineRangesByFile(
				this.cwd,
			),
			fileChanges,
			moduleIdByName: new Map(
				this.graphCollector
					.getModuleGraph()
					.modules.map((module) => [module.name, module.id]),
			),
		};
	}

	private getDeletedProviders(
		project: Project,
		context: ProviderImpactAnalysisContext,
	): ProviderRecord[] {
		const currentSnapshots =
			this.providerScanner.collectModuleProviderSnapshots(project, this.cwd);
		const deletedProviders = new Map<string, ProviderRecord>();
		const currentByModule = new Map(
			currentSnapshots.map((snapshot) => [snapshot.moduleName, snapshot]),
		);

		for (const file of context.fileChanges.changedFileSet) {
			const currentFileSnapshots = currentSnapshots.filter(
				(snapshot) => snapshot.file === file,
			);

			if (currentFileSnapshots.length === 0) continue;

			const oldFileContent = this.gitChanges.getHeadFileContent(this.cwd, file);
			if (!oldFileContent) continue;

			const oldSourceFile = project.createSourceFile(
				`/__awilixify_devtools_old__/${file}`,
				oldFileContent,
				{ overwrite: true },
			);
			const oldSnapshots =
				this.providerScanner.collectModuleProviderSnapshotsFromSourceFile(
					oldSourceFile,
					file,
				);

			for (const oldSnapshot of oldSnapshots) {
				const currentSnapshot = currentByModule.get(oldSnapshot.moduleName);

				if (!currentSnapshot) continue;

				for (const provider of oldSnapshot.providers) {
					if (currentSnapshot.providers.has(provider)) continue;

					deletedProviders.set(`${oldSnapshot.moduleName}:${provider}`, {
						deps: [],
						moduleFile: oldSnapshot.file,
						moduleName: oldSnapshot.moduleName,
						moduleProviderLine: 0,
						provider,
						sourceFile: oldSnapshot.file,
					});
				}
			}
		}

		return [...deletedProviders.values()];
	}

	private getNewProviders(
		providers: ProviderRecord[],
		context: ProviderImpactAnalysisContext,
	): ProviderRecord[] {
		return providers.filter(
			(provider) =>
				context.fileChanges.newFileSet.has(provider.sourceFile) ||
				// A provider can be new inside an existing module file when its providers entry was added.
				this.gitChanges.isLineChanged(
					context.changedLineRangesByFile,
					provider.moduleFile,
					provider.moduleProviderLine,
				),
		);
	}

	private getChangedProviders(
		providers: ProviderRecord[],
		context: ProviderImpactAnalysisContext,
		newProviderSet: Set<string>,
		deletedProviderSet: Set<string>,
	): ProviderRecord[] {
		return providers.filter(
			(provider) =>
				!deletedProviderSet.has(provider.provider) &&
				!newProviderSet.has(provider.provider) &&
				((provider.sourceFile !== provider.moduleFile &&
					context.fileChanges.changedFileSet.has(provider.sourceFile)) ||
					this.gitChanges.isLineChanged(
						context.changedLineRangesByFile,
						provider.moduleFile,
						provider.moduleProviderLine,
					)),
		);
	}

	private getAffectedProviders(
		changedProviderNames: string[],
		providers: ProviderRecord[],
	): ProviderRecord[] {
		const providerByKey = new Map(
			providers.map((provider) => [provider.provider, provider]),
		);
		const dependantsByProvider = this.getDependantsByProvider(providers);
		const changed = new Set(changedProviderNames);
		const affected = new Map<string, ProviderRecord>();

		for (const provider of changedProviderNames) {
			for (const dependant of dependantsByProvider.get(provider) ?? []) {
				if (changed.has(dependant) || affected.has(dependant)) continue;

				const record = providerByKey.get(dependant);
				if (!record) continue;

				affected.set(dependant, record);
			}
		}

		return [...affected.values()];
	}

	private getDependantsByProvider(
		providers: ProviderRecord[],
	): Map<string, Set<string>> {
		const dependants = new Map<string, Set<string>>();

		for (const provider of providers) {
			for (const dep of provider.deps) {
				const providerDependants = dependants.get(dep) ?? new Set<string>();
				providerDependants.add(provider.provider);
				dependants.set(dep, providerDependants);
			}
		}

		return dependants;
	}

	private toImpactItems(
		providers: ProviderRecord[],
		context: ProviderImpactAnalysisContext,
	): ProviderImpactItem[] {
		return providers.flatMap((provider) => {
			const moduleId = context.moduleIdByName.get(provider.moduleName);

			return moduleId
				? [
						{
							moduleId,
							moduleName: provider.moduleName,
							provider: provider.provider,
						},
					]
				: [];
		});
	}
}
