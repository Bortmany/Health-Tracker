// Where a hover hint sits: centred above its control, or below when there is
// no room above, and kept inside the screen sideways. Plain numbers in, plain
// numbers out, so it is easy to test.
export const TOOLTIP_MAX_WIDTH = 240;

export function placeTooltip(rect, viewportWidth) {
  const half = Math.min(TOOLTIP_MAX_WIDTH, Math.max(0, viewportWidth - 16)) / 2;
  const center = rect.left + rect.width / 2;
  const x = Math.min(Math.max(center, 8 + half), Math.max(8 + half, viewportWidth - 8 - half));
  const above = rect.top >= 56;
  return { x, y: above ? rect.top - 8 : rect.bottom + 8, above };
}
