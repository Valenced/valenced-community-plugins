import { after, instead } from '@valenced/patcher'
import { DEFAULT_STORAGE } from '../lib/types'
import type { YouBarPlusStorage } from '../lib/types'

function getValenced(): any {
	try {
		if (typeof valenced !== 'undefined') return valenced
	} catch {}
	return (globalThis as any).valenced
}

function getStores(): any {
	try {
		return getValenced()?.discord?.flux?.Stores ?? {}
	} catch {
		return {}
	}
}

function getFinders(): any {
	try {
		return getValenced()?.modules?.finders
	} catch {
		return undefined
	}
}

interface Favorite {
	id: string
	nickname: string | null
	type: number
	channelType: number
	order: number
	parentId: string | null
}

interface FavoriteStore {
	getFavoriteChannels(): Record<string, Favorite>
	getFavorite(id: string): Favorite | undefined
	isFavorite(id: string): boolean
	getFavoritesCount?(): number
	getFavoritesCountAgainstLimit?(): number
	emitChange(): void
}

export default function patchLocalFavorites(
	storage: any,
	cleanup: (fn: () => void) => void,
): () => void {
	const localCleanups: Array<() => void> = []
	const registerCleanup = (fn: any) => {
		if (typeof fn === 'function') {
			localCleanups.push(fn)
			cleanup(fn)
		}
	}

	const settings = (): YouBarPlusStorage => ({
		...DEFAULT_STORAGE,
		...((storage?.cache as Partial<YouBarPlusStorage> | undefined) ?? {}),
	})

	const local = (): string[] =>
		settings().localFavorites !== false ? (settings().favorites ?? []) : []

	const getChannel = (id: string) =>
		getStores()?.ChannelStore?.getChannel?.(id)

	const patchStore = (store: any) => {
		if (!store) return
		const proto = Object.getPrototypeOf(store) as FavoriteStore
		if (!proto || typeof proto.getFavoriteChannels !== 'function') return

		let base: Record<string, Favorite> | undefined
		let ids: string[] | undefined
		let merged: Record<string, Favorite> = {}

		registerCleanup(
			after(proto, 'getFavoriteChannels', (result: Record<string, Favorite> = {}) => {
				const favorites = local()
				if (!favorites.length) return result
				if (result !== base || favorites !== ids) {
					base = result
					ids = favorites
					merged = { ...result }
					favorites.forEach((id, order) => {
						const details = settings().favoriteDetails?.[id]
						if (!merged[id]) {
							merged[id] = {
								id,
								nickname: null,
								type: 1,
								channelType: getChannel(id)?.type ?? 0,
								order: details?.order ?? 1e6 + order,
								parentId:
									details?.parentId && result?.[details.parentId]?.type === 2
										? details.parentId
										: null,
							}
						}
					})
				}
				return merged
			}),
		)

		registerCleanup(
			instead(proto, 'getFavorite', function (this: any, args: any[], original: any) {
				return (
					Reflect.apply(original, this, args) ??
					store.getFavoriteChannels()?.[args[0]]
				)
			}),
		)

		registerCleanup(
			instead(proto, 'isFavorite', function (this: any, args: any[], original: any) {
				return (
					Reflect.apply(original, this, args) || local().includes(args[0])
				)
			}),
		)

		if (typeof proto.getFavoritesCountAgainstLimit === 'function') {
			registerCleanup(
				instead(
					proto,
					'getFavoritesCountAgainstLimit',
					function (this: any, args: any[], original: any) {
						if (settings().localFavorites !== false) {
							return 0
						}
						return Reflect.apply(original, this, args)
					},
				),
			)
		}

		if (typeof storage?.subscribe === 'function') {
			registerCleanup(
				storage.subscribe(() => {
					base = undefined
					store.emitChange()
				}),
			)
		}

		store.emitChange()
	}

	const patchActions = (actions: any) => {
		if (!actions || typeof actions.addFavoriteChannels !== 'function') return

		registerCleanup(
			instead(
				actions,
				'addFavoriteChannels',
				function (this: any, args: any[], original: any) {
					if (settings().localFavorites === false) {
						return Reflect.apply(original, this, args)
					}
					const currentFavs = settings().favorites ?? []
					const rawIds =
						args?.[0]?.channelIds ??
						(Array.isArray(args?.[0]) ? args[0] : [args?.[0]])
					const newIds = Array.isArray(rawIds) ? rawIds : []
					const mergedFavs = [...new Set([...currentFavs, ...newIds])]

					storage.set({
						favorites: mergedFavs,
					})
					try {
						getStores()?.FavoriteStore?.emitChange?.()
					} catch {}
				},
			),
		)

		registerCleanup(
			instead(
				actions,
				'removeFavoriteChannel',
				function (this: any, args: any[], original: any) {
					const { favorites = [] } = settings()
					const targetId = args[0]
					if (!favorites.includes(targetId)) {
						return Reflect.apply(original, this, args)
					}
					storage.set({
						favorites: favorites.filter(id => id !== targetId),
						favoriteDetails: { [targetId]: null },
					})
					try {
						getStores()?.FavoriteStore?.emitChange?.()
					} catch {}
				},
			),
		)

		registerCleanup(
			instead(
				actions,
				'updateFavoriteChannels',
				function (this: any, args: any[], original: any) {
					const favorites = local()
					const details: Record<string, any> = {}
					const updates = Array.isArray(args?.[0]) ? args[0] : []
					const remote = updates.filter((update: any) => {
						if (!favorites.includes(update.id)) return true
						const current = settings().favoriteDetails?.[update.id] ?? {}
						details[update.id] = {
							...current,
							...(update.parent_id !== undefined
								? { parentId: update.parent_id }
								: {}),
							...(update.position !== undefined
								? { order: update.position }
								: {}),
						}
						return false
					})
					if (remote.length === updates.length) {
						return Reflect.apply(original, this, args)
					}
					storage.set({ favoriteDetails: details })
					try {
						getStores()?.FavoriteStore?.emitChange?.()
					} catch {}
					if (remote.length > 0) {
						return Reflect.apply(original, this, [remote])
					}
				},
			),
		)
	}

	const patchLimitModule = (limits: any, key: string) => {
		if (!limits || limits[key] === undefined) return
		const limit = limits[key]
		const apply = () => {
			try {
				limits[key] =
					settings().localFavorites !== false ? Infinity : limit
			} catch {}
		}
		apply()
		if (typeof storage?.subscribe === 'function') {
			registerCleanup(storage.subscribe(apply))
		}
		registerCleanup(() => {
			try {
				limits[key] = limit
			} catch {}
		})
	}

	const finders = getFinders()

	const initialStore = getStores()?.FavoriteStore
	if (initialStore) {
		patchStore(initialStore)
	} else if (finders?.lookupModule && finders?.filters?.withProps) {
		const [storeMod] =
			finders.lookupModule(
				finders.filters.withProps('getFavoriteChannels'),
			) || []
		if (storeMod) patchStore(storeMod?.default ?? storeMod)
	}

	if (finders?.lookupModule && finders?.filters?.withProps) {
		const [actionsMod] =
			finders.lookupModule(
				finders.filters.withProps(
					'addFavoriteChannels',
					'removeFavoriteChannel',
				),
			) || []
		if (actionsMod) patchActions(actionsMod?.default ?? actionsMod)
	}

	for (const key of ['FREE_FAVORITE_LIMIT', 'MAX_FAVORITE_CHANNELS']) {
		if (finders?.lookupModules && finders?.filters?.withProps) {
			for (const [mod] of finders.lookupModules(
				finders.filters.withProps(key),
			)) {
				patchLimitModule(mod, key)
			}
		}
		if (
			typeof finders?.waitForModules === 'function' &&
			finders?.filters?.withProps
		) {
			const unsub = finders.waitForModules(
				finders.filters.withProps(key),
				(mod: any) => {
					patchLimitModule(mod, key)
				},
			)
			if (typeof unsub === 'function') registerCleanup(unsub)
		}
	}

	return () => {
		for (const fn of localCleanups) {
			try {
				fn()
			} catch {}
		}
	}
}
