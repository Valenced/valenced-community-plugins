/**
 * Bottom padding for a scrollable settings page, so the system gesture bar doesn't cover the
 * last card. A fixed value, as Global Badges uses: enough on every phone tested, and it keeps the
 * pages off the safe-area external.
 */
export function useBottomPadding(base = 24): number {
	return base
}
