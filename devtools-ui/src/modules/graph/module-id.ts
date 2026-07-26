import type { ModuleGraphNode } from "@/api/model";

export function getInvocationModuleId(module: ModuleGraphNode): string {
	return module.instances[0]?.id ?? module.id;
}
