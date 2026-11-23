import { Stores } from '@valenced/discord/flux'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Animated, View } from 'react-native'
import { close } from '../../api/engine'
import { reportError } from '../../lib/errors'
import { ToastCard } from './ToastCard'
import type { DiscordModules } from '@valenced/discord/types'
import type { ToastApiSettings, ToastEntry } from '../../types'

const AnimatedView = Animated.createAnimatedComponent(View)

/** Spring settings used by Discord's legacy toast container. */
const OPACITY_SPRING_PHYSICS = {
	mass: 0.1,
	damping: 10,
	stiffness: 100,
	overshootClamping: true,
}

const TOAST_SPRING_PHYSICS = {
	mass: 0.35,
	damping: 15,
	stiffness: 350,
	restDisplacementThreshold: 0.1,
	restSpeedThreshold: 0.1,
}

/** Start 30 px beyond the screen edge relative to the stack's resting anchor. */
export function startY(anchor: 'top' | 'bottom', safeTop: number): number {
	return anchor === 'top' ? -(safeTop + 38) : safeTop + 38
}

function isReducedMotion(): boolean {
	const accessibilityStore =
		Stores.AccessibilityStore as DiscordModules.Flux.Store<{
			useReducedMotion?: boolean
		}>
	return accessibilityStore?.useReducedMotion === true
}

/** Animate a toast's entrance and exit. */
export function ToastMotion({
	entry,
	settings,
	maxWidth,
	anchor,
	safeTop,
	mode,
	onExited,
}: {
	entry: ToastEntry
	settings: ToastApiSettings
	maxWidth: number
	anchor: 'top' | 'bottom'
	safeTop: number
	mode: 'enter' | 'exit'
	onExited: () => void
}) {
	const entering = mode === 'enter'
	const rest = 0
	const edge = startY(anchor, safeTop)
	const from = entering ? edge : rest
	const to = entering ? rest : edge

	const [values] = useState(() => ({
		opacity: new Animated.Value(entering ? 0 : 1),
		translateY: new Animated.Value(from),
		width: new Animated.Value(0),
	}))
	const [pinned, setPinned] = useState(false)
	const pinnedRef = useRef(false)
	const natural = useRef(0)
	const widthSpring = useRef<any>(null)
	const [contentWidth, setContentWidth] = useState<number>()
	const measurementInputs = useRef({ entry, settings, maxWidth })
	measurementInputs.current = { entry, settings, maxWidth }

	const exited = useRef(onExited)
	exited.current = onExited

	useEffect(() => {
		const toOpacity = entering ? 1 : 0

		if (isReducedMotion()) {
			values.opacity.setValue(toOpacity)
			values.translateY.setValue(to)
			if (!entering) exited.current()
			return
		}

		const fade = Animated.spring(values.opacity, {
			toValue: toOpacity,
			useNativeDriver: true,
			...OPACITY_SPRING_PHYSICS,
		})
		const move = Animated.spring(values.translateY, {
			toValue: to,
			useNativeDriver: true,
			...TOAST_SPRING_PHYSICS,
		})
		fade.start()
		move.start(({ finished }: { finished: boolean }) => {
			if (finished && !entering) exited.current()
		})
		return () => {
			fade.stop()
			move.stop()
		}
		// The key changes when mode flips, so this runs once per entrance or exit.
	}, [])

	useEffect(
		() => () => {
			widthSpring.current?.stop?.()
		},
		[],
	)

	const measure = useCallback(
		(event: any) => {
			const next = event?.nativeEvent?.layout?.width
			if (typeof next !== 'number' || !(next > 0)) return
			const currentInputs = measurementInputs.current
			if (
				currentInputs.entry !== entry ||
				currentInputs.settings !== settings ||
				currentInputs.maxWidth !== maxWidth
			) {
				return
			}
			if (!pinnedRef.current) {
				pinnedRef.current = true
				natural.current = next
				values.width.setValue(next)
				setPinned(true)
			} else if (Math.abs(next - natural.current) >= 0.5) {
				natural.current = next
				widthSpring.current?.stop?.()
				if (isReducedMotion()) {
					values.width.setValue(next)
				} else {
					const spring = Animated.spring(values.width, {
						toValue: next,
						useNativeDriver: false,
						...TOAST_SPRING_PHYSICS,
					})
					widthSpring.current = spring
					spring.start()
				}
			}
		},
		[entry, maxWidth, settings, values],
	)
	const measureContent = useCallback(
		(event: any) => {
			const next = event?.nativeEvent?.layout?.width
			if (typeof next !== 'number' || !(next > 0)) return
			const currentInputs = measurementInputs.current
			if (
				currentInputs.entry !== entry ||
				currentInputs.settings !== settings ||
				currentInputs.maxWidth !== maxWidth
			) {
				return
			}
			setContentWidth(current =>
				current != null && Math.abs(current - next) < 0.5 ? current : next,
			)
		},
		[entry, maxWidth, settings],
	)

	// Ignore taps while the toast is exiting.
	const pressable = entering && typeof entry.onPress === 'function'
	const handlePress = useCallback(() => {
		if (!entry.onPress) return
		try {
			entry.onPress(entry.id)
		} catch (error) {
			reportError(error)
		}
		// `closeOnPress: false` leaves this toast visible.
		if (entry.closeOnPress !== false) close(entry.id)
	}, [entry])

	// Let touches pass through unless the toast itself is pressable.
	const pass = pressable ? 'box-none' : 'none'
	const hide = !pressable

	return (
		<View
			pointerEvents={pass}
			accessibilityElementsHidden={hide}
			importantForAccessibility={pressable ? 'auto' : 'no-hide-descendants'}
			style={{ width: '100%', alignItems: 'center' }}
		>
			<View
				pointerEvents="none"
				accessibilityElementsHidden
				importantForAccessibility="no-hide-descendants"
				style={{
					position: 'absolute',
					left: 0,
					right: 0,
					top: 0,
					opacity: 0,
					alignItems: 'center',
				}}
			>
				<View onLayout={measure}>
					<ToastCard
						entry={entry}
						settings={settings}
						maxWidth={maxWidth}
						onContentLayout={measureContent}
					/>
				</View>
			</View>

			<AnimatedView
				pointerEvents={pass}
				style={{
					opacity: values.opacity,
					transform: [{ translateY: values.translateY }],
				}}
			>
				<AnimatedView
					pointerEvents={pass}
					style={pinned ? { width: values.width } : undefined}
				>
					<ToastCard
						entry={entry}
						settings={settings}
						maxWidth={maxWidth}
						contentWidth={contentWidth}
						fill={pinned}
						onPress={pressable ? handlePress : undefined}
					/>
				</AnimatedView>
			</AnimatedView>
		</View>
	)
}
