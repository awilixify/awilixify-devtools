import type {
	DevtoolsProcessorContext,
	DevtoolsProcessor as DevtoolsProcessorContract,
} from "awilixify/devtools";
import type { Deps } from "./devtools.module.js";

export class DevtoolsProcessor implements DevtoolsProcessorContract {
	constructor(
		readonly graphCollector: Deps["graphCollector"],
		readonly tracer: Deps["tracer"],
	) {}

	initialize({ rootModule, globalModules }: DevtoolsProcessorContext): void {
		this.graphCollector.initialize(rootModule, globalModules);
	}
}
