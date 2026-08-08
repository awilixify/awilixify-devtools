// Re-export types from DTOs for backwards compatibility
export type {
	GetGraphResponse as ModuleGraph,
	GetModuleDetailsResponse as ModuleGraphModuleDetails,
	ModuleGraphEdge,
	ModuleGraphEntrypoint,
	ModuleGraphGlobalProviderGroup,
	ModuleGraphNode,
	ModuleGraphRoute,
} from "../dtos/index.js";

import type { GetGraphResponse, ModuleGraphNode } from "../dtos/index.js";

export type ModuleGraphNodeInternal = ModuleGraphNode & {
	interceptorClassNames: Record<string, string>;
	interceptorDecoratorNames: Record<string, string[]>;
	initializerClassNames: Record<string, string>;
};

export type ModuleGraphInternal = Omit<
	GetGraphResponse,
	"modules" | "availableDecorators"
> & {
	modules: ModuleGraphNodeInternal[];
};
