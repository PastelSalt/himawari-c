/** How Studio's panes share a window's width. */

/** The narrowest the writing area gets while the side panes can still give way. */
export const MIN_CENTER = 480;
export const MIN_SIDE = 170;
export const MIN_RIGHT = 320;

/**
 * The widths the Explorer and the preview actually get. The saved sizes are kept, but on a narrow
 * window (a small laptop screen, or one not maximized) the preview gives way first and then the
 * Explorer, so the screenplay never shrinks to a column of single words (found by the e2e suite
 * at 1100 px, where the middle got 230 px).
 */
export function fitPanes(windowWidth: number, side: number, right: number, showSide: boolean): { side: number; right: number } {
  const chrome = 46 + 3; // the activity bar and the splitters
  let over = (showSide ? side : 0) + right + MIN_CENTER - (windowWidth - chrome);
  if (over <= 0) return { side, right };
  const fromRight = Math.min(over, Math.max(0, right - MIN_RIGHT));
  right -= fromRight;
  over -= fromRight;
  if (showSide && over > 0) side -= Math.min(over, Math.max(0, side - MIN_SIDE));
  return { side, right };
}
