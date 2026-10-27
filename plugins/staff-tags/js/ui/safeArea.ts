import { ReactNativeSafeAreaContext } from '@valenced/externals/react-native-safe-area-context'

/**
 * Bottom padding for a scrollable settings page, so the system gesture bar doesn't cover the last
 * row. A hook: call it unconditionally at the top of the page.
 */
export function useBottomPadding(base = 16): number {
	return ReactNativeSafeAreaContext.useSafeAreaInsets().bottom + base
}
