import { onImportedPath, safeInstead, safeInsteadJSX } from '../modules'
import { getSettings } from '../state'
import type { PluginCleanupApi } from '@valenced/plugins/types'

export function patchWishlist(cleanup: PluginCleanupApi): void {
	const enabled = () => getSettings().wishlist

	// Patch useSegmentedControlState to filter out wishlist/board items
	cleanup(
		onImportedPath<any>(
			'design/components/SegmentedControl/native/SegmentedControlState.native.tsx',
			ns => {
				if (typeof ns?.useSegmentedControlState !== 'function') return
				cleanup(
					safeInstead(ns, 'useSegmentedControlState', (args, original) => {
						if (!enabled()) return original(...args)
						if (!Array.isArray(args[0]?.items)) return original(...args)
						const items = args[0].items
						if (
							!items.some(
								(i: any) =>
									i?.id === 'wishlist' ||
									i?.id === 'board' ||
									i?.id === 'activity',
							)
						) {
							return original(...args)
						}
						const filtered = items.filter(
							(i: any) =>
								i?.id !== 'wishlist' &&
								i?.id !== 'board' &&
								i?.id !== 'activity',
						)
						return original({ ...args[0], items: filtered })
					}),
				)
			},
		),
	)

	// Patch Tabs to hide bar when only 1 tab remains
	cleanup(
		onImportedPath<any>('design/components/Tabs/native/Tabs.native.tsx', ns => {
			const Tabs = ns?.Tabs
			if (typeof Tabs !== 'function') return
			cleanup(
				safeInsteadJSX(Tabs, (args: any, jsx: any) => {
					if (!enabled()) return jsx(...args)
					const state = args?.[1]?.state
					const items = state?.items
					if (Array.isArray(items) && items.length <= 1) return null
					return jsx(...args)
				}),
			)
		}),
	)
}
