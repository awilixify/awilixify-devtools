import type { ProviderImpactStatus } from "../../types";

// Impact status is shown as color + glyph (redundant channels) so it doesn't
// rely on color alone and doesn't collide with the focus fill: the glyph leads
// the chip and the same color paints the left diff-gutter bar.
export const STATUS_GLYPH: Record<ProviderImpactStatus, string> = {
	new: "+",
	changed: "~",
	affected: "!",
	deleted: "×",
};

export const STATUS_COLOR_VAR: Record<ProviderImpactStatus, string> = {
	new: "var(--graph-color-new-provider)",
	changed: "var(--graph-color-changed-provider)",
	affected: "var(--graph-color-affected-provider)",
	deleted: "var(--graph-color-deleted-provider)",
};

export function resolveProviderStatus(flags: {
	added?: boolean;
	affected?: boolean;
	changed?: boolean;
	deleted?: boolean;
}): ProviderImpactStatus | null {
	if (flags.deleted) return "deleted";
	if (flags.added) return "new";
	if (flags.changed) return "changed";
	if (flags.affected) return "affected";
	return null;
}
