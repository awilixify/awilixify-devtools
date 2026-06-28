import { getSearchHighlightParts } from "../../graph-search";
import styles from "./ModuleNode.module.css";

export function HighlightedText({
	query,
	text,
}: {
	query: string;
	text: string;
}) {
	if (!query.trim()) return text;

	const parts = getSearchHighlightParts(text, query);

	return (
		<>
			{parts.map((part, index) =>
				part.match ? (
					<mark
						className={styles.searchHighlight}
						key={`${part.text}-${index}`}
					>
						{part.text}
					</mark>
				) : (
					part.text
				),
			)}
		</>
	);
}
