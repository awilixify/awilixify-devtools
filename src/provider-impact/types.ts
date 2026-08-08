// Re-export types from DTOs for backwards compatibility
export type { ProviderImpact, ProviderImpactItem } from "../dtos/index.js";

export type ProviderRecord = {
	className?: string;
	deps: string[];
	moduleName: string;
	moduleFile: string;
	moduleProviderLine: number;
	provider: string;
	sourceFile: string;
};

export type ModuleProviderSnapshot = {
	file: string;
	moduleName: string;
	providers: Set<string>;
};
