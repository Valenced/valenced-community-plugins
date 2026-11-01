export type YouBarButtonId = 'dms' | 'notifications' | 'settings' | 'favorites'

export interface YouBarPlusStorage {
	showDMButton: boolean
	showSettingsButton: boolean
	showNotificationsButton: boolean
	showFavoritesButton?: boolean
	doubleTapReturn?: boolean
	lastLocation?: {
		guildId: string
		channelId?: string
	}
	order: YouBarButtonId[]
	compactAvatar: boolean
	hideStatus: boolean
	compactHeader: boolean
	hideBuiltinDM?: boolean
	localFavorites?: boolean
	favorites?: string[]
	favoriteDetails?: Record<string, { order?: number; parentId?: string | null } | null>
	moduleCache?: {
		statusRowId?: number
		profileContentId?: number
		youBarButtonId?: number
		userSettingsId?: number
		transitionRouterId?: number
		guildsBarMessagesId?: number
		useGuildsBarPropsId?: number
		guildsBarId?: number
	}
}

export const DEFAULT_STORAGE: YouBarPlusStorage = {
	showDMButton: true,
	showSettingsButton: true,
	showNotificationsButton: true,
	showFavoritesButton: false,
	doubleTapReturn: true,
	order: ['dms', 'notifications', 'settings', 'favorites'],
	compactAvatar: false,
	hideStatus: false,
	compactHeader: false,
	hideBuiltinDM: false,
	localFavorites: true,
	favorites: [],
	favoriteDetails: {},
	moduleCache: {},
}

export function isButtonEnabled(
	id: YouBarButtonId,
	storage?: Partial<YouBarPlusStorage>,
): boolean {
	switch (id) {
		case 'dms':
			return storage?.showDMButton !== false
		case 'notifications':
			return storage?.showNotificationsButton !== false
		case 'settings':
			return storage?.showSettingsButton !== false
		case 'favorites':
			return storage?.showFavoritesButton === true
	}
}

export function formatOrdinal(n: number): string {
	const s = ['th', 'st', 'nd', 'rd']
	const v = n % 100
	return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export function getNormalizedOrder(
	storage?: Partial<YouBarPlusStorage>,
): YouBarButtonId[] {
	const baseOrder: YouBarButtonId[] = Array.isArray(storage?.order)
		? [...storage.order]
		: [...DEFAULT_STORAGE.order]

	const allIds: YouBarButtonId[] = ['dms', 'notifications', 'settings', 'favorites']
	const seen = new Set<YouBarButtonId>()
	const result: YouBarButtonId[] = []

	for (const id of baseOrder) {
		if (allIds.includes(id) && !seen.has(id)) {
			seen.add(id)
			result.push(id)
		}
	}
	for (const id of allIds) {
		if (!seen.has(id)) {
			seen.add(id)
			result.push(id)
		}
	}
	return result
}

export function getActiveButtons(
	storage?: Partial<YouBarPlusStorage>,
): YouBarButtonId[] {
	const fullOrder = getNormalizedOrder(storage)
	return fullOrder.filter(id => isButtonEnabled(id, storage))
}

export function getButtonOrdinal(
	storage: Partial<YouBarPlusStorage>,
	buttonId: YouBarButtonId,
): string {
	const active = getActiveButtons(storage)
	const idx = active.indexOf(buttonId)
	if (idx === -1) return 'Disabled'
	return formatOrdinal(idx + 1)
}

export function setButtonIndex(
	storage: Partial<YouBarPlusStorage>,
	buttonId: YouBarButtonId,
	targetActiveIndex: number,
): YouBarButtonId[] {
	const fullOrder = getNormalizedOrder(storage)
	const active = getActiveButtons(storage)

	const currentActiveIdx = active.indexOf(buttonId)
	if (
		currentActiveIdx === -1 ||
		targetActiveIndex < 0 ||
		targetActiveIndex >= active.length ||
		currentActiveIdx === targetActiveIndex
	) {
		return fullOrder
	}

	const targetButtonId = active[targetActiveIndex]
	const fullIdxA = fullOrder.indexOf(buttonId)
	const fullIdxB = fullOrder.indexOf(targetButtonId)

	if (fullIdxA !== -1 && fullIdxB !== -1) {
		fullOrder[fullIdxA] = targetButtonId
		fullOrder[fullIdxB] = buttonId
	}

	return fullOrder
}

export async function saveCachedModuleId(
	storage: any,
	key: keyof NonNullable<YouBarPlusStorage['moduleCache']>,
	id: number,
) {
	try {
		const current = await storage.get()
		const currentCache = current?.moduleCache ?? {}
		if (currentCache[key] === id) return
		await storage.set({
			...DEFAULT_STORAGE,
			...current,
			moduleCache: {
				...currentCache,
				[key]: id,
			},
		})
	} catch {}
}
