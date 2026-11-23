import {
	getModuleWithImportedPath,
	lookupModuleWithImportedPath,
} from '@valenced/discord/utils/modules/finders'
import { instead } from '@valenced/patcher'
import { React, ReactJSXRuntime } from '@valenced/react'
import { ToastLayer } from '../ui/toast/ToastLayer'
import { reportError } from './errors'

const PATHS = {
	manaContainer: 'design/mana/components/Toast/ToastContainer.native.tsx',
	safeAreaStore: 'modules/safe_area/SafeAreaStore.native.tsx',
}

// Force one container render after installing the JSX patch.
const INSET_NUDGE = 0.0001

/**
 * Change the safe-area value slightly to trigger a container rerender. If the
 * store is not ready or has no entries, the container's first render picks up
 * the patch without a nudge.
 */
function nudgeInsets(): boolean {
	const [ns] = lookupModuleWithImportedPath<any>(PATHS.safeAreaStore)
	if (ns == null) return false
	const store = ns.default
	if (
		typeof store?.setState !== 'function' ||
		typeof store?.getState !== 'function'
	) {
		reportError(new Error('SafeAreaStore has no setState'))
		return false
	}
	try {
		const byAppEntry = store.getState()?.byAppEntry
		if (byAppEntry == null || typeof byAppEntry !== 'object') return false
		const keys = Object.keys(byAppEntry)
		if (keys.length === 0) return false
		const next: Record<string, any> = {}
		for (const key of keys) {
			const entry = byAppEntry[key]
			const insets = entry?.safeAreaInsets
			next[key] =
				insets && typeof insets === 'object' && typeof insets.top === 'number'
					? {
							...entry,
							safeAreaInsets: { ...insets, top: insets.top + INSET_NUDGE },
						}
					: entry
		}
		store.setState({ byAppEntry: next })
		return true
	} catch (error) {
		reportError(error)
		return false
	}
}

export function patchAll(): () => void {
	const disposers: Array<() => void> = []
	let stopped = false
	let hostPatched = false

	const add = (unsub: any) => {
		if (typeof unsub === 'function') {
			if (stopped) unsub()
			else disposers.push(unsub)
		}
	}

	// Defer the nudge in case the module initializes during a render.
	function requestNudge(): void {
		if (stopped) return
		const handle = setTimeout(() => {
			if (!stopped) nudgeInsets()
		}, 0)
		disposers.push(() => clearTimeout(handle))
	}

	function patchHost(ns: any): void {
		if (hostPatched || stopped) return
		const host = ns?.ToastContainer
		if (
			host == null ||
			(typeof host !== 'function' && typeof host !== 'object')
		)
			return
		try {
			for (const method of ['jsx', 'jsxs'] as const) {
				add(
					instead(ReactJSXRuntime, method, function (args, original) {
						const element = Reflect.apply(original, this, args)
						const props = args[1] as
							| {
									overlay?: boolean
									offset?: { top?: number; bottom?: number }
							  }
							| undefined
						if (args[0] !== host || props?.overlay !== true) return element
						return React.createElement(
							React.Fragment,
							null,
							element,
							React.createElement(ToastLayer, {
								offset: props.offset,
							}),
						)
					}),
				)
			}
			hostPatched = true
		} catch (error) {
			reportError(error)
			return
		}
		requestNudge()
	}

	// Patch the container now if loaded, or when it initializes.
	add(getModuleWithImportedPath(PATHS.manaContainer, ns => patchHost(ns)))

	return () => {
		stopped = true
		for (const dispose of disposers.splice(0)) {
			try {
				dispose()
			} catch (error) {
				reportError(error)
			}
		}
	}
}
