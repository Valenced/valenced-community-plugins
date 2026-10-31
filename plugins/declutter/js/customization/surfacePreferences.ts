export interface SurfacePreferences {
	hidden: string[]
	order: string[]
	sections?: Record<string, string>
}

export interface Section<T> {
	key: string
	entries: T[]
}

// Missing destinations fall back to the host section; unavailable rows keep their preferences.
export function arrangeSections<T, S extends Section<T>>(
	groups: readonly S[],
	preferences: SurfacePreferences,
	identify: (entry: T) => string | undefined,
): S[] {
	const keys = new Set(groups.map(group => group.key))
	const result = groups.map(group => ({ ...group, entries: [] as T[] }))
	for (const group of groups) {
		for (const entry of group.entries) {
			const id = identify(entry)
			const assigned = id ? preferences.sections?.[id] : undefined
			const key = assigned && keys.has(assigned) ? assigned : group.key
			result.find(section => section.key === key)!.entries.push(entry)
		}
	}
	return result.map(group => ({
		...group,
		entries: applyOrder(group.entries, preferences.order, identify),
	}))
}

export function moveToSection<T>(
	preferences: SurfacePreferences,
	groups: readonly Section<T>[],
	identify: (entry: T) => string | undefined,
	id: string,
	section: string,
	before?: string,
): SurfacePreferences {
	const destination = groups.find(group => group.key === section)
	if (
		!destination ||
		!groups.some(group => group.entries.some(entry => identify(entry) === id))
	)
		return preferences
	const ordered = destination.entries
		.map(identify)
		.filter((key): key is string => !!key && key !== id)
	const index = before ? ordered.indexOf(before) : -1
	ordered.splice(index < 0 ? ordered.length : index, 0, id)
	return {
		...preferences,
		sections: { ...preferences.sections, [id]: section },
		order: [
			...preferences.order.filter(key => !ordered.includes(key)),
			...ordered,
		],
	}
}

export const defaultSurfacePreferences: SurfacePreferences = {
	hidden: [],
	order: [],
}

// Unranked and unsupported entries keep their original slots.
export function applyOrder<T>(
	items: readonly T[],
	order: readonly string[],
	identify: (item: T) => string | undefined,
): T[] {
	const ranks = new Map(order.map((id, index) => [id, index]))
	const ranked = items
		.filter(item => ranks.has(identify(item) ?? ''))
		.sort((a, b) => ranks.get(identify(a)!)! - ranks.get(identify(b)!)!)
	let index = 0
	return items.map(item =>
		ranks.has(identify(item) ?? '') ? ranked[index++] : item,
	)
}
