import { Stores } from '@valenced/discord/flux'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Animated, Platform } from 'react-native'
import { barHapticFeedback } from './PullHandle'
import type { BarSpring, GestureLibrary } from './PullHandle'

// Both layout-driven surfaces and the native You bar use the same spring policy.
export function springTo(
	animation: Animated.Value,
	target: number,
	velocity = 0,
	useNativeDriver = false,
) {
	const [native] = lookupModule(withProps<BarSpring>('YOU_BAR_SPRING_CONFIG'), {
		initialize: false,
	})
	animation.stopAnimation()
	if (
		!native ||
		('useReducedMotion' in Stores.AccessibilityStore &&
			Stores.AccessibilityStore.useReducedMotion === true)
	) {
		animation.setValue(target)
		return
	}
	const motion = Animated.spring(animation, {
		...native.YOU_BAR_SPRING_CONFIG,
		overshootClamping: false,
		velocity,
		toValue: target,
		useNativeDriver,
	})
	motion.start()
	return motion
}

export function useCollapsibleBar(enabled: boolean, onCollapse?: () => void) {
	const [collapsed, setCollapsed] = useState(false)
	const hidden = enabled && collapsed
	const hiddenRef = useRef(hidden)
	hiddenRef.current = hidden
	const [animation] = useState(() => new Animated.Value(0))
	const target = useRef(false)
	const animate = useCallback(
		(next: boolean, velocity = 0) => {
			target.current = next
			springTo(animation, Number(next), velocity)
		},
		[animation],
	)
	const settle = useCallback(
		(next: boolean, velocity: number) => {
			if (next) onCollapse?.()
			if (hiddenRef.current !== next) barHapticFeedback()
			hiddenRef.current = next
			setCollapsed(next)
			animate(next, velocity)
		},
		[animate, onCollapse],
	)
	useEffect(() => {
		if (target.current !== hidden) animate(hidden)
	}, [animate, hidden])
	useEffect(() => () => animation.stopAnimation(), [animation])
	useEffect(() => {
		if (!enabled) setCollapsed(false)
	}, [enabled])
	const [library] = lookupModule(
		withProps<GestureLibrary>('Gesture', 'GestureDetector'),
		{ initialize: false },
	)
	const [panels] = lookupModule(
		withProps<{
			ANDROID_PANELS_ANIMATION_CONFIG: { touchSlopForPanGesture: number }
			DEFAULT_PANELS_ANIMATION_CONFIG: { touchSlopForPanGesture: number }
		}>('ANDROID_PANELS_ANIMATION_CONFIG', 'DEFAULT_PANELS_ANIMATION_CONFIG'),
		{ initialize: false },
	)
	const slop = (
		Platform.OS === 'android'
			? panels?.ANDROID_PANELS_ANIMATION_CONFIG
			: panels?.DEFAULT_PANELS_ANIMATION_CONFIG
	)?.touchSlopForPanGesture
	return { hidden, hiddenRef, setCollapsed, animation, settle, library, slop }
}
