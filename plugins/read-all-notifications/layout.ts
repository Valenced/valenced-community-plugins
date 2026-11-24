import { isFavoritesLabel, isRecord } from './guards'

const GuildsBarListNativeId = 'guilds-bar-fast-list'

export const DirectMessagesRow = { section: 0, item: 0 } as const

type SizeFn = (section: number, item?: number) => number
type RenderItemFn = (
	section: number,
	item?: number,
	instance?: unknown,
) => unknown

interface FastListComputerLike {
	dirty?: boolean
}

interface FastListInstanceLike {
	forceUpdate?(): void
	computeBlocks?(): void
	state?: { fastListComputer?: FastListComputerLike }
}

interface FastListRefLike {
	current?: FastListInstanceLike | null
}

const heights = new Map<number, number>()

let nextButtonId = 1
let generation = 0
let extraHeight = 0
let capturedRef: FastListRefLike | undefined
let capturedInstance: FastListInstanceLike | undefined
let sizeWrapper:
	| { original: unknown; generation: number; fn: SizeFn }
	| undefined
let renderItemWrapper: { original: unknown; fn: RenderItemFn } | undefined

let favoritesSeen = false
let favoritesRow: { section: number; item: number } | undefined

const favoritesListeners = new Set<() => void>()

export function isFavoritesSeen(): boolean {
	return favoritesSeen
}

export function subscribeFavorites(listener: () => void): () => void {
	favoritesListeners.add(listener)
	return () => favoritesListeners.delete(listener)
}

export function markFavoritesSeen(): void {
	if (favoritesSeen) return
	favoritesSeen = true
	setTimeout(notifyFavorites, 0)
}

function notifyFavorites(): void {
	for (const listener of favoritesListeners) listener()
}

function currentInstance(): FastListInstanceLike | undefined {
	return capturedRef?.current ?? capturedInstance
}

function isFastListInstance(value: unknown): value is FastListInstanceLike {
	return isRecord(value)
}

function isFastListRef(value: unknown): value is FastListRefLike {
	return isRecord(value) && 'current' in value
}

export function acquireButtonId(): number {
	return nextButtonId++
}

export function releaseButton(id: number): void {
	if (!heights.delete(id)) return
	recompute()
}

export function reportButtonHeight(id: number, height: number): void {
	if (!Number.isFinite(height)) return

	for (const [key, value] of heights) {
		if (value <= 0 && key !== id) heights.delete(key)
	}

	heights.set(id, Math.max(height, 0))
	recompute()
}

function recompute(): void {
	let total = 0
	for (const height of heights.values()) total += height

	const next = Math.round(total * 100) / 100
	if (next === extraHeight) return

	extraHeight = next
	generation++
	refreshLayoutModel()
}

function refreshLayoutModel(): void {
	const instance = currentInstance()
	const computer = instance?.state?.fastListComputer
	if (!instance || !computer) return

	const refresh = instance.forceUpdate ?? instance.computeBlocks
	if (typeof refresh !== 'function') return

	try {
		computer.dirty = true
		refresh.call(instance)
	} catch {
		return
	}
}

export function augmentGuildsBarListProps(props: unknown): unknown {
	if (!isRecord(props)) return props

	const { ref, itemSize, renderItem } = props
	if (isFastListRef(ref)) capturedRef = ref

	favoritesSeen = false
	favoritesRow = undefined

	const size =
		typeof itemSize === 'function'
			? getSizeWrapper(itemSize as SizeFn)
			: undefined
	const render =
		typeof renderItem === 'function'
			? getRenderItemWrapper(renderItem as RenderItemFn)
			: undefined

	if (!size && !render) return props

	const next: Record<string, unknown> = { ...props }
	if (size) next.itemSize = size
	if (render) next.renderItem = render

	return next
}

function getSizeWrapper(original: SizeFn): SizeFn {
	if (
		sizeWrapper &&
		sizeWrapper.original === original &&
		sizeWrapper.generation === generation
	) {
		return sizeWrapper.fn
	}

	const fn: SizeFn = (section, item) => {
		const base = original(section, item) ?? 0
		const row = favoritesRow ?? DirectMessagesRow
		if (section === row.section && (item ?? row.item) === row.item) {
			return base + extraHeight
		}
		return base
	}

	sizeWrapper = { original, generation, fn }
	return fn
}

function getRenderItemWrapper(original: RenderItemFn): RenderItemFn {
	if (renderItemWrapper && renderItemWrapper.original === original) {
		return renderItemWrapper.fn
	}

	const fn: RenderItemFn = (section, item, instance) => {
		if (isFastListInstance(instance)) capturedInstance = instance

		const element = original(section, item, instance)

		if (isRecord(element) && isRecord(element.props)) {
			if (isFavoritesLabel(element.props.label)) {
				favoritesRow = { section, item: item ?? 0 }
			}
		}

		return element
	}

	renderItemWrapper = { original, fn }
	return fn
}

export function isGuildsBarListProps(props: unknown): boolean {
	if (!isRecord(props)) return false

	const { nativeID, sections } = props
	return (
		typeof nativeID === 'string' &&
		nativeID.startsWith(GuildsBarListNativeId) &&
		Array.isArray(sections)
	)
}

export function resetLayoutBridge(): void {
	sizeWrapper = undefined
	renderItemWrapper = undefined
	favoritesSeen = false
	favoritesRow = undefined
	favoritesListeners.clear()
}
