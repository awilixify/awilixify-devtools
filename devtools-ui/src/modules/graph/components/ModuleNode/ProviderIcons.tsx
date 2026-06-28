import clsx from "clsx";
import type { CSSProperties } from "react";
import type { LifetimeType } from "@/api/model";
import styles from "./ModuleNode.module.css";

export function AllowCircularIcon() {
	return (
		<span
			aria-label="Allows circular dependency"
			className={styles.allowCircularIcon}
			role="img"
			title="Allows circular dependency"
		/>
	);
}

export function ExportedProviderIcon({ style }: { style?: CSSProperties }) {
	return (
		<span
			aria-label="Exported provider"
			className={styles.exportedProviderIcon}
			role="img"
			style={style}
			title="Exported provider"
		>
			↗
		</span>
	);
}

export function EagerProviderIcon() {
	return (
		<span
			aria-label="Eager provider"
			className={styles.providerEagerIcon}
			role="img"
			title="Eager provider"
		>
			E
		</span>
	);
}

export function FactoryProviderIcon() {
	return (
		<span
			aria-label="Factory provider"
			className={styles.providerFactoryIcon}
			role="img"
			title="Factory provider (useFactory)"
		>
			F
		</span>
	);
}

export function LifetimeTypeIcon({ lifetime }: { lifetime?: LifetimeType }) {
	if (lifetime !== "SCOPED" && lifetime !== "TRANSIENT") return null;

	return (
		<span
			aria-label={`${lifetime.toLowerCase()} provider`}
			className={clsx(styles.lifetimeTypeIcon, {
				[styles.scoped]: lifetime === "SCOPED",
				[styles.transient]: lifetime === "TRANSIENT",
			})}
			role="img"
			title={`${lifetime.toLowerCase()} provider`}
		>
			{lifetime === "SCOPED" ? "S" : "T"}
		</span>
	);
}
