// Layout metrics for provider-mode module nodes, shared by node sizing
// (flow-nodes) and ELK handle placement (graph-layout) so edge endpoints line
// up with the rendered provider groups — and the last handle never lands past
// the node border. A "row" is one provider or one member chip.

const BLOCK_START_Y = 44; // node header above the first provider group
const BLOCK_STACK_GAP = 10; // vertical gap between provider group blocks
const BLOCK_END_PADDING = 16; // space below the last block to the node border
const PAPER_PADDING_Y = 16; // provider group Paper top + bottom padding
const TITLE_HEIGHT = 16; // group title row
const CONTENT_GAP = 6; // gap between title and rows
// Every row (provider chip or member row) is pinned to this height so the model
// matches what renders. Member rows set min-height to it (see ProviderGroup).
export const PROVIDER_ROW_HEIGHT = 23;
const ROW_GAP = 6;
const EMPTY_HEIGHT = 16; // "No providers" placeholder

export function providerBlockHeight(rowCount: number): number {
	const content =
		rowCount > 0
			? rowCount * PROVIDER_ROW_HEIGHT + (rowCount - 1) * ROW_GAP
			: EMPTY_HEIGHT;

	return PAPER_PADDING_Y + TITLE_HEIGHT + CONTENT_GAP + content;
}

export function providerBlockCenterY(
	rowCounts: number[],
	index: number,
): number {
	let cursor = BLOCK_START_Y;

	for (let i = 0; i < index; i++) {
		cursor += providerBlockHeight(rowCounts[i]) + BLOCK_STACK_GAP;
	}

	return cursor + providerBlockHeight(rowCounts[index]) / 2;
}

export function providerNodeHeight(rowCounts: number[]): number {
	const blocksHeight = rowCounts.reduce(
		(sum, rowCount, index) =>
			sum + providerBlockHeight(rowCount) + (index > 0 ? BLOCK_STACK_GAP : 0),
		0,
	);

	return BLOCK_START_Y + blocksHeight + BLOCK_END_PADDING;
}
