import { Drawer } from "@mantine/core";
import { useGraphSettings } from "../../GraphSettingsContext";
import type { ModuleNodeData } from "../../types";
import { ModuleInspector } from "./ModuleInspector";

type ModuleDrawerProps = {
	module: ModuleNodeData | null;
	loading: boolean;
};

export function ModuleDrawer({ module, loading }: ModuleDrawerProps) {
	const { setSelectedModuleId } = useGraphSettings();

	return (
		<Drawer.Root
			opened={!loading && module !== null}
			onClose={() => setSelectedModuleId(null)}
			position="right"
			size={420}
			trapFocus={false}
			closeOnEscape={false}
			closeOnClickOutside={false}
		>
			<Drawer.Content p={0}>
				<Drawer.Header
					style={{
						background: "var(--mantine-color-body)",
						borderBottom: "1px solid var(--mantine-color-gray-2)",
						minHeight: 36,
						padding: "8px 8px 8px 16px",
						zIndex: 1,
					}}
				>
					<Drawer.Title>{module?.name ?? "Module"}</Drawer.Title>
					<Drawer.CloseButton />
				</Drawer.Header>
				<Drawer.Body
					style={{
						padding: "8px 16px 24px",
					}}
				>
					<ModuleInspector module={module} />
				</Drawer.Body>
			</Drawer.Content>
		</Drawer.Root>
	);
}
