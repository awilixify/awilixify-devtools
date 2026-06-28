import { Box, CloseButton, Group, Text, TextInput } from "@mantine/core";
import type { ChangeEvent } from "react";

import { useGraphSettings } from "../GraphSettingsContext";

export function GraphToolbar() {
	const { searchInput, setSearchInput, submitSearch } = useGraphSettings();

	return (
		<Group align="center" gap="md">
			<Box>
				<Text c="dimmed" size="xs" fw={700} tt="uppercase">
					Module graph
				</Text>
			</Box>

			<TextInput
				placeholder="Search modules or providers"
				value={searchInput}
				w={{ base: "100%", sm: 340 }}
				onChange={(event: ChangeEvent<HTMLInputElement>) =>
					setSearchInput(event.currentTarget.value)
				}
				onKeyDown={(event) => {
					if (event.key === "Enter") submitSearch();
				}}
				rightSection={
					searchInput ? (
						<CloseButton
							aria-label="Clear search"
							onClick={() => setSearchInput("")}
							size="sm"
						/>
					) : null
				}
				rightSectionPointerEvents="auto"
			/>
		</Group>
	);
}
