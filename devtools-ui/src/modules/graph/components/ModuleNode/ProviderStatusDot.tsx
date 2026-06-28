import clsx from "clsx";
import type { ProviderImpactStatus } from "../../types";
import styles from "./ModuleNode.module.css";
import { resolveProviderStatus, STATUS_GLYPH } from "./provider-status";

// A colored glyph (+ ~ ! ×) — color plus shape, so status reads without relying
// on color alone. On provider chips it's paired with a left diff-gutter bar.
export function ProviderStatusMark({
	added,
	affected,
	changed,
	deleted,
	status,
}: {
	added?: boolean;
	affected?: boolean;
	changed?: boolean;
	deleted?: boolean;
	status?: ProviderImpactStatus;
}) {
	const resolved =
		status ?? resolveProviderStatus({ added, affected, changed, deleted });

	if (!resolved) return null;

	return (
		<span
			className={clsx(styles.providerStatusMark, styles[resolved])}
			title={resolved}
		>
			{STATUS_GLYPH[resolved]}
		</span>
	);
}
