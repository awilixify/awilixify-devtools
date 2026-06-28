import fuzzysort from "fuzzysort";

// fuzzysort scores 1 = perfect, 0.5 = good, 0 = no match. Kept low so
// subsequence/abbreviation matches survive (e.g. "cts" → "cats" ≈ 0.36,
// "usrsvc" → "UserService" ≈ 0.29); fuzzysort already returns null for true
// non-matches, so this only trims the very loosest hits. Shared by the minimap
// highlight, camera focus, and title highlight so they all agree.
const MATCH_THRESHOLD = 0.2;

export type SearchHighlightPart = {
	text: string;
	match: boolean;
};

export function matchesSearch(text: string, query: string): boolean {
	const normalized = query.trim();
	if (!normalized) return false;

	const result = fuzzysort.single(normalized, text);

	return result !== null && result.score >= MATCH_THRESHOLD;
}

// The best fuzzy match among items, or null. Used to pick which node the camera
// focuses on when searching.
export function findBestSearchMatch<T>(
	items: readonly T[],
	getText: (item: T) => string,
	query: string,
): T | null {
	const normalized = query.trim();
	if (!normalized) return null;

	const [best] = fuzzysort.go(normalized, items, {
		key: getText,
		threshold: MATCH_THRESHOLD,
		limit: 1,
	});

	return best?.obj ?? null;
}

// Splits text into matched / unmatched runs so the matched characters can be
// wrapped for highlighting. Returns a single unmatched run when the text does
// not match, so callers can render it verbatim.
export function getSearchHighlightParts(
	text: string,
	query: string,
): SearchHighlightPart[] {
	const normalized = query.trim();
	const result = normalized ? fuzzysort.single(normalized, text) : null;

	if (!result || result.score < MATCH_THRESHOLD) {
		return [{ text, match: false }];
	}

	const matchedIndexes = new Set(result.indexes);
	const parts: SearchHighlightPart[] = [];

	for (let index = 0; index < text.length; index++) {
		const isMatch = matchedIndexes.has(index);
		const previous = parts.at(-1);

		if (previous && previous.match === isMatch) {
			previous.text += text[index];
		} else {
			parts.push({ text: text[index], match: isMatch });
		}
	}

	return parts;
}
