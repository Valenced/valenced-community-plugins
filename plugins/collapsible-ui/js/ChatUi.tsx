import { Tokens } from '@valenced/discord/common/tokens'
import { Design } from '@valenced/discord/design'
import { getModules, lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { after } from '@valenced/patcher'
import { findInTree } from '@valenced/utils/tree'
import {
	cloneElement,
	createContext,
	isValidElement,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
	useSyncExternalStore,
} from 'react'
import { Animated, Keyboard, View } from 'react-native'
import { useCollapsibleBar } from './collapse'
import { DragStrip } from './DragStrip'
import { usePullHandle } from './PullHandle'
import { defaults } from './Settings'
import type { PluginApi } from '@valenced/plugins/types'
import type { ComponentProps, ReactElement, ReactNode, RefObject } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import type { Settings } from './Settings'

let useHandleStyles: ReturnType<typeof Design.createStyles> | undefined

function useChatSurfaceStyles() {
	useHandleStyles ??= Design.createStyles({
		surface: { backgroundColor: Tokens.default.colors.BACKGROUND_BASE_LOWER },
	})
	return useHandleStyles()
}

function ChatDragStrip(props: ComponentProps<typeof DragStrip>) {
	const styles = useChatSurfaceStyles()
	return (
		<View style={styles.surface}>
			<DragStrip {...props} />
		</View>
	)
}

export interface HostProps {
	ref?: RefObject<{ dismissKeyboard(): void } | null>
	children?: ReactNode
	channelId?: string
	screenIndex?: number
	pendingReply?: unknown
	pendingEdit?: unknown
	style?: StyleProp<ViewStyle>
	pointerEvents?: 'none' | 'auto'
	accessibilityElementsHidden?: boolean
	importantForAccessibility?: 'no-hide-descendants' | 'auto'
}
export type HostTree = ReactElement<HostProps>
export function createChatUi({
	jsonStorage,
	cleanup,
}: PluginApi<{ jsonStorage: Settings }>) {
	const AnimatedView = Animated.View
	let running = true
	const listeners = new Set<() => void>()
	const subscribe = (listener: () => void) => {
		listeners.add(listener)
		return () => {
			listeners.delete(listener)
		}
	}
	cleanup(() => {
		running = false
		listeners.forEach(listener => listener())
	})
	function useSettings() {
		const active = useSyncExternalStore(subscribe, () => running)
		const settings = { ...defaults, ...jsonStorage.use() }
		return {
			collapsibleHeader: active && settings.collapsibleHeader,
			collapsibleInput: active && settings.collapsibleInput,
		}
	}
	const CollapsibleInputContext = createContext(false)
	function GuardContainer({ tree }: { tree: HostTree }) {
		const collapsible = useContext(CollapsibleInputContext)
		return collapsible
			? cloneElement(tree, { style: [tree.props.style, { marginTop: 0 }] })
			: tree
	}
	cleanup(
		getModules(
			withProps<{
				ChatInputGuardContainer(props: HostProps): HostTree
			}>('ChatInputGuardContainer'),
			namespace => {
				cleanup(
					after(namespace, 'ChatInputGuardContainer', tree => (
						<GuardContainer tree={tree} />
					)),
				)
			},
		),
	)

	function ChannelPage({ tree }: { tree: HostTree }) {
		const { collapsibleHeader } = useSettings()
		const fragment = tree.props.children
		if (
			!collapsibleHeader ||
			!isValidElement<HostProps>(fragment) ||
			!Array.isArray(fragment.props.children)
		)
			return tree
		const [header, chat, ...rest] = fragment.props.children
		if (
			!isValidElement<HostProps>(header) ||
			!isValidElement(chat) ||
			typeof header.props.channelId !== 'string'
		)
			return tree
		const [safeArea] = lookupModule(
			withProps<{ default: unknown; getSafeAreaInsets(): { top: number } }>(
				'getSafeAreaInsets',
				'default',
			),
			{ initialize: false },
		)
		return cloneElement(
			tree,
			{},
			cloneElement(
				fragment,
				{},
				<CollapsibleHeader inset={safeArea?.getSafeAreaInsets().top ?? 0}>
					{header}
				</CollapsibleHeader>,
				chat,
				...rest,
			),
		)
	}
	function useHeaderBar(inset: number, panelGesture?: unknown) {
		const { collapsibleHeader } = useSettings()
		const bar = useCollapsibleBar(collapsibleHeader)
		const { hidden, hiddenRef, animation, settle, library, slop } = bar
		const [height, setHeight] = useState(0)
		const pull = usePullHandle(
			library,
			animation,
			hidden,
			height - inset,
			slop ?? 0,
			settle,
			-1,
		)
		const gesture = useMemo(() => {
			if (!library || slop === undefined) return
			return library.Gesture.Pan()
				.enabled(collapsibleHeader && !hidden && !pull.dragging)
				.runOnJS(true)
				.activeOffsetY([-slop, slop])
				.failOffsetX([-slop * 3, slop * 3])
				.simultaneousWithExternalGesture(
					...(panelGesture ? [panelGesture] : []),
				)
				.onEnd((event, success) => {
					const next = event.translationY < 0
					if (!success || hiddenRef.current === next) return
					settle(next, -event.velocityY / Math.max(1, height - inset))
				})
		}, [
			library,
			collapsibleHeader,
			hidden,
			hiddenRef,
			pull.dragging,
			settle,
			height,
			inset,
			panelGesture,
			slop,
		])
		if (!collapsibleHeader || !library || !gesture || !pull.gesture) return
		return {
			hidden,
			animation,
			settle,
			library,
			gesture,
			pull: pull.gesture,
			height,
			setHeight,
			inset,
		}
	}
	type HeaderBar = NonNullable<ReturnType<typeof useHeaderBar>>

	function HeaderBody({
		bar,
		children,
	}: {
		bar: HeaderBar
		children: ReactNode
	}) {
		return (
			<bar.library.GestureDetector gesture={bar.gesture}>
				<AnimatedView
					collapsable={false}
					pointerEvents={bar.hidden ? 'none' : 'auto'}
					accessibilityElementsHidden={bar.hidden}
					importantForAccessibility={
						bar.hidden ? 'no-hide-descendants' : 'auto'
					}
					style={{
						height: bar.animation.interpolate({
							inputRange: [0, 1, 1.12],
							outputRange: [bar.height, bar.inset, bar.inset],
						}),
						opacity: bar.animation.interpolate({
							inputRange: [0, 1],
							outputRange: [1, 0],
							extrapolate: 'clamp',
						}),
						overflow: 'hidden',
					}}
				>
					<View
						style={{ position: 'absolute', left: 0, right: 0, top: 0 }}
						onLayout={event => bar.setHeight(event.nativeEvent.layout.height)}
					>
						{children}
					</View>
				</AnimatedView>
			</bar.library.GestureDetector>
		)
	}
	function HeaderHandle({ bar }: { bar: HeaderBar }) {
		return (
			<ChatDragStrip
				library={bar.library}
				gesture={bar.pull}
				hidden={bar.hidden}
				label="channel header"
				onToggle={() => bar.settle(!bar.hidden, 0)}
			/>
		)
	}
	function CollapsibleHeader({
		children,
		inset,
	}: {
		children: ReactNode
		inset: number
	}) {
		const bar = useHeaderBar(inset)
		if (!bar) return children
		return (
			<View collapsable={false} pointerEvents="box-none" style={{ zIndex: 1 }}>
				<HeaderBody bar={bar}>{children}</HeaderBody>
				<HeaderHandle bar={bar} />
			</View>
		)
	}
	function Composer({
		children: tree,
		inputRef,
	}: {
		children: HostTree
		inputRef?: HostProps['ref']
	}) {
		const { collapsibleInput } = useSettings()
		const styles = useChatSurfaceStyles()
		const onCollapse = useCallback(() => {
			inputRef?.current?.dismissKeyboard()
			Keyboard.dismiss()
		}, [inputRef])
		const {
			hidden,
			hiddenRef,
			setCollapsed,
			animation,
			settle,
			library,
			slop,
		} = useCollapsibleBar(collapsibleInput, onCollapse)
		const [height, setHeight] = useState(0)

		const context = findInTree(
			tree,
			(node): node is HostTree =>
				isValidElement<HostProps>(node) && 'pendingReply' in node.props,
			{ walkable: new Set(['props', 'children']) },
		)
		useEffect(() => {
			if (context?.props.pendingReply || context?.props.pendingEdit)
				setCollapsed(false)
		}, [context?.props.pendingReply, context?.props.pendingEdit])
		useEffect(() => {
			if (!hidden) return
			const subscription = Keyboard.addListener('keyboardDidShow', () =>
				setCollapsed(false),
			)
			return () => subscription.remove()
		}, [hidden])
		useEffect(() => {
			if (!hidden || tree.props.screenIndex === undefined) return
			const [layout] = lookupModule(
				withProps<{
					default: {
						getState(): { chatInputContainerHeight: Map<number, number> }
					}
					updateChatInputContainerHeight(
						screenIndex: number,
						height: number,
					): void
				}>('updateChatInputContainerHeight', 'default'),
				{ initialize: false },
			)
			const index = tree.props.screenIndex
			const height = layout?.default
				.getState()
				.chatInputContainerHeight.get(index)
			if (!layout || height === undefined) return
			// Discord positions its jump button from this measurement, not the hidden wrapper.
			layout.updateChatInputContainerHeight(index, 0)
			return () => layout.updateChatInputContainerHeight(index, height)
		}, [hidden, tree.props.screenIndex])

		const pull = usePullHandle(
			library,
			animation,
			hidden,
			height,
			slop ?? 0,
			settle,
		)
		const gesture = useMemo(() => {
			if (!library || slop === undefined) return
			return library.Gesture.Pan()
				.enabled(collapsibleInput && !hidden && !pull.dragging)
				.runOnJS(true)
				.activeOffsetY([-slop, slop])
				.failOffsetX([-slop * 3, slop * 3])
				.onEnd((event, success) => {
					const next = event.translationY > 0
					if (!success || hiddenRef.current === next) return
					settle(next, event.velocityY / Math.max(1, height))
				})
		}, [library, collapsibleInput, hidden, pull.dragging, settle, height, slop])

		const child = tree.props.children
		if (!collapsibleInput || !isValidElement<HostProps>(child)) return tree
		const composer = cloneElement(
			tree,
			{},
			cloneElement(child, {
				style: [child.props.style, { marginTop: 0 }],
				pointerEvents: hidden ? 'none' : 'auto',
				accessibilityElementsHidden: hidden,
				importantForAccessibility: hidden ? 'no-hide-descendants' : 'auto',
			}),
		)
		const interpolate = (outputRange: number[]) =>
			animation.interpolate({
				inputRange: [0, 1],
				outputRange,
				extrapolate: 'clamp',
			})
		return library && gesture && pull.gesture ? (
			<AnimatedView style={[styles.surface, { flex: 0 }]}>
				<View collapsable={false} pointerEvents="box-none">
					<ChatDragStrip
						library={library}
						gesture={pull.gesture}
						hidden={hidden}
						label="chat box"
						onToggle={() => settle(!hidden, 0)}
					/>
					<library.GestureDetector gesture={gesture}>
						<AnimatedView
							collapsable={false}
							pointerEvents={hidden ? 'none' : 'auto'}
							style={{
								height: animation.interpolate({
									inputRange: [0, 1, 1.12],
									outputRange: [height, 0, 0],
								}),
								opacity: interpolate([1, 0]),
								overflow: 'hidden',
							}}
						>
							<View
								style={{ position: 'absolute', left: 0, right: 0, top: 0 }}
								onLayout={event => setHeight(event.nativeEvent.layout.height)}
							>
								<CollapsibleInputContext.Provider value={true}>
									{composer}
								</CollapsibleInputContext.Provider>
							</View>
						</AnimatedView>
					</library.GestureDetector>
				</View>
			</AnimatedView>
		) : (
			tree
		)
	}

	return {
		StandaloneChannelScreen: (tree: HostTree) => <ChannelPage tree={tree} />,
		ChatInput: (tree: HostTree, inputRef?: HostProps['ref']) => (
			<Composer inputRef={inputRef}>{tree}</Composer>
		),
	}
}
