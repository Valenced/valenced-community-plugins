import { useCallback, useRef, useState } from 'react'
import { Dimensions, StyleSheet, View } from 'react-native'
import { useEntries, useSettings } from '../hooks'
import { ToastMotion } from './ToastMotion'
import type { ToastEntry, ToastPosition } from '../../types'

function Stack({
	entries,
	anchor,
	safeTop,
	offset,
}: {
	entries: ToastEntry[]
	anchor: ToastPosition
	safeTop: number
	offset: number
}) {
	const settings = useSettings()
	const [ghosts, setGhosts] = useState<ToastEntry[]>([])
	// Keep exiting toasts in the stack until their animation finishes.
	const slots = useRef<ToastEntry[]>([])
	// Used to detect entries removed since the previous render.
	const previousLive = useRef<ToastEntry[]>([])

	const dropGhost = useCallback((id: string) => {
		setGhosts(current => current.filter(entry => entry.id !== id))
	}, [])

	const liveIds = new Set(entries.map(entry => entry.id))
	const knownGhostIds = new Set(ghosts.map(entry => entry.id))
	const departed = previousLive.current.filter(
		entry => !liveIds.has(entry.id) && !knownGhostIds.has(entry.id),
	)
	const pending = [
		...ghosts.filter(entry => !liveIds.has(entry.id)),
		...departed,
	]
	const ghostsMatch =
		pending.length === ghosts.length &&
		pending.every((entry, index) => entry.id === ghosts[index]?.id)
	if (!ghostsMatch) setGhosts(pending)

	const ghostIds = new Set(pending.map(entry => entry.id))
	const liveById = new Map(entries.map(entry => [entry.id, entry]))
	const carried = slots.current
		.map(
			entry =>
				liveById.get(entry.id) ?? (ghostIds.has(entry.id) ? entry : undefined),
		)
		.filter((entry): entry is ToastEntry => entry !== undefined)
	const seen = new Set(carried.map(entry => entry.id))
	const arriving = entries.filter(entry => !seen.has(entry.id))
	// Place newly added entries at the edge where their animation starts.
	const fresh = anchor === 'top' ? [...arriving].reverse() : arriving
	const list =
		anchor === 'top' ? [...fresh, ...carried] : [...carried, ...fresh]

	slots.current = list
	previousLive.current = entries

	if (list.length === 0) return null

	const screen = Dimensions.get('window')
	const maxWidth =
		settings.maxWidth > 0 ? settings.maxWidth : Math.max(0, screen.width - 32)

	return (
		<View
			pointerEvents="box-none"
			style={{
				position: 'absolute',
				left: 0,
				right: 0,
				...(anchor === 'top' ? { top: offset } : { bottom: offset }),
				alignItems: 'center',
			}}
		>
			<View
				pointerEvents="box-none"
				style={{
					width: '100%',
					alignItems: 'center',
					gap: settings.gap,
				}}
			>
				{list.map(entry => {
					const ghost = ghostIds.has(entry.id)
					return (
						<ToastMotion
							key={ghost ? `${entry.id}-out` : entry.id}
							entry={entry}
							settings={settings}
							maxWidth={maxWidth}
							anchor={anchor}
							safeTop={safeTop}
							mode={ghost ? 'exit' : 'enter'}
							onExited={() => dropGhost(entry.id)}
						/>
					)
				})}
			</View>
		</View>
	)
}

/** Render toast stacks alongside Discord's container using its calculated offsets. */
export function ToastLayer({
	offset,
}: {
	offset?: { top?: number; bottom?: number }
}) {
	const entries = useEntries()

	const safeTop = offset?.top ?? 0
	const safeBottom = offset?.bottom ?? 0
	const top = entries.filter(entry => entry.position === 'top')
	const bottom = entries.filter(entry => entry.position === 'bottom')
	// Keep the layer accessible while it contains a pressable toast.
	const anyPressable = entries.some(
		entry => typeof entry.onPress === 'function',
	)

	return (
		<View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
			<View
				pointerEvents="box-none"
				accessibilityElementsHidden={!anyPressable}
				importantForAccessibility={
					anyPressable ? 'auto' : 'no-hide-descendants'
				}
				style={StyleSheet.absoluteFill}
			>
				<Stack
					entries={top}
					anchor="top"
					safeTop={safeTop}
					offset={safeTop + 8}
				/>
				<Stack
					entries={bottom}
					anchor="bottom"
					safeTop={safeBottom}
					offset={safeBottom + 8}
				/>
			</View>
		</View>
	)
}
