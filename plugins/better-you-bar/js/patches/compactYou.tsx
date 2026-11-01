import {
	findByImportedPath,
	waitForImportedPath,
} from '../../../shared/finders'
import { getYouBarStorage } from '../lib/storage'
import { DEFAULT_STORAGE } from '../lib/types'
import type { JsonStorage } from '@valenced/json-storage'
import type { YouBarPlusStorage } from '../lib/types'

const getCurrentStorage = (): YouBarPlusStorage => ({
	...DEFAULT_STORAGE,
	...getYouBarStorage(),
})

export const syncConstants = () => {
	let c: any
	try {
		c =
			findByImportedPath(
				'modules/main_tabs_v2/native/you_bar/YouBarConstants.tsx',
			) ??
			valenced.modules.finders.lookupModule(
				valenced.modules.finders.filters.withProps(
					'YOU_BAR_HEIGHT',
					'YOU_BAR_PADDING',
				),
			)?.[0]
	} catch {}

	if (!c?.YOU_BAR_HEIGHT) return
	const current = getCurrentStorage()
	c.YOU_BAR_HEIGHT = current.compactHeader ? 44 : 56
	c.YOU_BAR_PADDING = current.compactHeader ? 4 : 12
	if (current.compactAvatar) {
		c.YOU_BAR_AVATAR_LARGE_PX = 45
	} else {
		c.YOU_BAR_AVATAR_LARGE_PX = 60
	}
}

export default function patchCompactYou(
	storage: JsonStorage<YouBarPlusStorage>,
): () => void {
	const cleanups: Array<() => void> = []
	const patchedTargets = new WeakSet<object>()
	const React = valenced.react.React
	const RN = valenced.react.ReactNative

	const patchHeaderComponent = (mod: any) => {
		const target = mod?.default ?? mod
		if (!target || (typeof target !== 'function' && typeof target !== 'object'))
			return
		if (patchedTargets.has(target)) return
		patchedTargets.add(target)

		const prop = typeof target.type === 'function' ? 'type' : 'default'
		const holder = typeof target.type === 'function' ? target : mod

		try {
			const unpatch = valenced.patcher.instead(
				holder,
				prop,
				(args: any[], orig: any) => {
					const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0)
					React.useEffect(() => {
						const unsub = storage.subscribe(() => {
							syncConstants()
							forceUpdate()
						})
						return () => unsub?.()
					}, [])

					const res = orig(...args)
					if (!res) return res
					const current = getCurrentStorage()
					if (!current.compactHeader) return res

					return React.cloneElement(res, {
						style: [
							res.props?.style,
							{
								height: 44,
								minHeight: 40,
								paddingVertical: 2,
							},
						],
					})
				},
			)
			cleanups.push(unpatch)
		} catch {}
	}

	const patchYouBarAvatar = (mod: any) => {
		const target = mod?.default ?? mod
		if (!target || (typeof target !== 'function' && typeof target !== 'object'))
			return
		if (patchedTargets.has(target)) return
		patchedTargets.add(target)

		const prop = typeof target.type === 'function' ? 'type' : 'default'
		const holder = typeof target.type === 'function' ? target : mod

		try {
			const unpatch = valenced.patcher.instead(
				holder,
				prop,
				(args: any[], orig: any) => {
					const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0)
					React.useEffect(() => {
						const unsub = storage.subscribe(() => {
							syncConstants()
							forceUpdate()
						})
						return () => unsub?.()
					}, [])

					const res = orig(...args)
					if (!res) return res
					const current = getCurrentStorage()
					if (!current.compactAvatar) return res

					return React.createElement(
						RN?.View ?? 'View',
						{
							style: {
								transform: [{ scale: 0.75 }],
								alignItems: 'center',
								justifyContent: 'center',
								marginHorizontal: -4,
							},
						},
						res,
					)
				},
			)
			cleanups.push(unpatch)
		} catch {}
	}

	const patchYouName = (mod: any) => {
		const target = mod?.default ?? mod
		if (!target || (typeof target !== 'function' && typeof target !== 'object'))
			return
		if (patchedTargets.has(target)) return
		patchedTargets.add(target)

		const prop = typeof target.type === 'function' ? 'type' : 'default'
		const holder = typeof target.type === 'function' ? target : mod

		try {
			const unpatch = valenced.patcher.instead(
				holder,
				prop,
				(args: any[], orig: any) => {
					const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0)
					React.useEffect(() => {
						const unsub = storage.subscribe(() => forceUpdate())
						return () => unsub?.()
					}, [])

					const res = orig(...args)
					if (!res) return res
					const current = getCurrentStorage()
					if (!current.hideStatus) return res

					if (res.props?.children && Array.isArray(res.props.children)) {
						return React.cloneElement(res, {
							children: [res.props.children[0]],
						})
					}

					return res
				},
			)
			cleanups.push(unpatch)
		} catch {}
	}

	const patchActivityModule = (m: any) => {
		const target = m?.default ?? m
		if (!target) return
		if (patchedTargets.has(target)) return
		patchedTargets.add(target)

		const prop =
			typeof target === 'function'
				? 'default'
				: typeof target.default === 'function'
					? 'default'
					: undefined
		const holder = prop === 'default' && target.default ? target : m

		if (holder && typeof holder.default === 'function') {
			try {
				const unpatch = valenced.patcher.instead(
					holder,
					'default',
					(args: any[], orig: any) => {
						const current = getCurrentStorage()
						if (current.hideStatus) return false
						return orig(...args)
					},
				)
				cleanups.push(unpatch)
			} catch {}
		}
	}

	const initPatches = () => {
		syncConstants()

		
		const headerPaths = [
			'modules/main_tabs_v2/native/you_bar/YouBarBackground.tsx',
			'modules/main_tabs_v2/native/you_bar/YouBar.tsx',
		]
		for (const p of headerPaths) {
			const mod = findByImportedPath(p)
			if (mod) patchHeaderComponent(mod)
			const unsub = waitForImportedPath(p, m => patchHeaderComponent(m))
			if (unsub) cleanups.push(unsub)
		}

		
		const avatarPaths = [
			'modules/main_tabs_v2/native/you_bar/YouBarAvatarDefault.tsx',
			'modules/main_tabs_v2/native/you_bar/YouBarAvatar.tsx',
		]
		for (const p of avatarPaths) {
			const mod = findByImportedPath(p)
			if (mod) patchYouBarAvatar(mod)
			const unsub = waitForImportedPath(p, m => patchYouBarAvatar(m))
			if (unsub) cleanups.push(unsub)
		}

		
		const namePath = 'modules/main_tabs_v2/native/you_bar/YouBarName.tsx'
		const nameMod = findByImportedPath(namePath)
		if (nameMod) patchYouName(nameMod)
		const unsubNamePath = waitForImportedPath(namePath, m => patchYouName(m))
		if (unsubNamePath) cleanups.push(unsubNamePath)

		
		const statusPaths = [
			'modules/main_tabs_v2/native/you_bar/YouBarActivityStatusExperiment.tsx',
			'modules/activity_status/native/ActivityStatus.tsx',
		]
		for (const p of statusPaths) {
			const mod = findByImportedPath(p)
			if (mod) patchActivityModule(mod)
			const unsub = waitForImportedPath(p, m => patchActivityModule(m))
			if (unsub) cleanups.push(unsub)
		}
	}

	initPatches()

	try {
		const unsubThemed = valenced.modules.finders.getModules(
			valenced.modules.finders.filters.withName('YouBarThemed'),
			(m: any) => patchHeaderComponent(m),
			{ cached: true, returnNamespace: true },
		)
		cleanups.push(() => unsubThemed?.())
	} catch {}

	try {
		const unsubBg = valenced.modules.finders.getModules(
			valenced.modules.finders.filters.withName('YouBarBackground'),
			(m: any) => patchHeaderComponent(m),
			{ cached: true, returnNamespace: true },
		)
		cleanups.push(() => unsubBg?.())
	} catch {}

	try {
		const unsubName = valenced.modules.finders.getModules(
			valenced.modules.finders.filters.withName('YouName'),
			(m: any) => patchYouName(m),
			{ cached: true, returnNamespace: true },
		)
		cleanups.push(() => unsubName?.())
	} catch {}

	return () => {
		for (const fn of cleanups) {
			try {
				fn()
			} catch {}
		}
	}
}
