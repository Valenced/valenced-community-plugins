import { getAssetIdByName } from '@valenced/assets'
import { Tokens } from '@valenced/discord/common/tokens'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { BottomSheet } from '@valenced/externals/gorhom'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { lookupGeneratedIconComponent } from '@valenced/utils/discord'
import {
	cloneElement,
	isValidElement,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react'
import { Animated, PanResponder, ScrollView, View } from 'react-native'
import { barHapticFeedback } from './haptics'
import {
	edgeScrollSpeed,
	findDropTarget,
	getSectionPreview,
} from './sectionDrag'
import { arrangeSections, moveToSection } from './surfacePreferences'
import type { ComponentProps, ComponentType, ReactNode } from 'react'
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native'
import type { DropTarget, SectionBounds } from './sectionDrag'
import type { SurfacePreferences } from './surfacePreferences'
import type { SurfaceRowProps } from './surfaces'

export interface EditorEntry {
	id?: string
	key: string
	row: ReactNode
}
export interface EditorSection {
	key: string
	title?: ReactNode
	entries: EditorEntry[]
}
export interface EditorRowProps {
	entry: EditorEntry
	hidden: boolean
	slot: number
	count: number
	onToggle(): void
	onStart(y: number): void
	onMove(y: number): void
	onEnd(): void
	onCancel(): void
	onStep(direction: number): void
}

export function EditorRow({
	entry,
	hidden,
	onToggle,
	onStart,
	onMove,
	onEnd,
	onCancel,
	onStep,
}: EditorRowProps) {
	const latest = useRef({ onStart, onMove, onEnd, onCancel })
	latest.current = { onStart, onMove, onEnd, onCancel }
	const responder = useMemo(
		() =>
			PanResponder.create({
				onStartShouldSetPanResponder: () => true,
				onMoveShouldSetPanResponder: () => true,
				onPanResponderGrant: (_, gesture) => latest.current.onStart(gesture.y0),
				onPanResponderMove: (_, gesture) =>
					latest.current.onMove(gesture.moveY),
				onPanResponderRelease: () => latest.current.onEnd(),
				onPanResponderTerminate: () => latest.current.onCancel(),
				onPanResponderTerminationRequest: () => false,
			}),
		[],
	)
	const DragIcon = useMemo(() => lookupGeneratedIconComponent('DragIcon'), [])
	const Button = Design.IconButton as ComponentType<
		Omit<ComponentProps<typeof Design.IconButton>, 'variant'> & {
			variant: ComponentProps<typeof Design.IconButton>['variant'] | 'icon-only'
		}
	>
	const row = isValidElement<SurfaceRowProps>(entry.row) ? entry.row : undefined
	const label =
		typeof row?.props.label === 'string' ? row.props.label : 'action'
	if (!entry.id || !row) return <View pointerEvents="none">{entry.row}</View>
	return cloneElement(row, {
		onPress: undefined,
		arrow: false,
		trailing: (
			<View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
				<Button
					icon={getAssetIdByName(hidden ? 'EyeSlashIcon' : 'EyeIcon')!}
					variant="icon-only"
					size="sm"
					onPress={onToggle}
					accessibilityLabel={`${hidden ? 'Show' : 'Hide'} ${label}`}
				/>
				<View
					{...responder.panHandlers}
					accessible
					accessibilityRole="adjustable"
					accessibilityLabel={`Reorder ${label}`}
					accessibilityHint="Drag between sections. Hold near the top or bottom to scroll."
					accessibilityActions={[
						{ name: 'increment', label: 'Move down' },
						{ name: 'decrement', label: 'Move up' },
					]}
					onAccessibilityAction={event =>
						onStep(event.nativeEvent.actionName === 'increment' ? 1 : -1)
					}
					hitSlop={6}
					style={{
						width: 32,
						height: 32,
						alignItems: 'center',
						justifyContent: 'center',
					}}
				>
					{DragIcon && <DragIcon size="sm" />}
				</View>
			</View>
		),
	})
}

const ignore = () => {}
function MovingView({
	offset,
	spring,
	reduced,
	style,
	...props
}: ComponentProps<typeof View> & {
	offset: number
	spring: Pick<Animated.SpringAnimationConfig, 'mass' | 'stiffness' | 'damping'>
	reduced: boolean
}) {
	const AnimatedView = Animated.View
	const [translation] = useState(() => new Animated.Value(0))
	useEffect(() => {
		translation.stopAnimation()
		if (reduced) translation.setValue(offset)
		else
			Animated.spring(translation, {
				...spring,
				toValue: offset,
				useNativeDriver: true,
			}).start()
		return () => translation.stopAnimation()
	}, [offset, reduced, spring, translation])
	return (
		<AnimatedView
			{...props}
			style={[style, { transform: [{ translateY: translation }] }]}
		/>
	)
}
export function SectionEditor({
	groups,
	preferences,
	onChange,
	header,
	RowComponent = EditorRow,
	inSheet = false,
}: {
	groups: EditorSection[]
	preferences: SurfacePreferences
	onChange(next: SurfacePreferences): void
	header?: ReactNode
	RowComponent?: ComponentType<EditorRowProps>
	inSheet?: boolean
}) {
	const AnimatedView = Animated.View
	const spring = useMemo(() => {
		const [motion] = lookupModule(
			withProps<{
				SUBTLE_SPRING: Pick<
					Animated.SpringAnimationConfig,
					'mass' | 'stiffness' | 'damping'
				>
				springStandard: unknown
			}>('SUBTLE_SPRING', 'springStandard'),
			{ initialize: false },
		)
		if (!motion) throw Error('Action sheet drag animation is unavailable')
		return motion.SUBTLE_SPRING
	}, [])
	const EditorScrollView = inSheet
		? BottomSheet.BottomSheetScrollView
		: ScrollView
	const sections = useMemo(
		() =>
			arrangeSections(groups, preferences, (entry: EditorEntry) => entry.id),
		[groups, preferences],
	)
	const root = useRef<View>(null)
	const scroll = useRef<ScrollView>(null)
	const scrollY = useRef(0)
	const contentHeight = useRef(0)
	const viewport = useRef({ y: 0, height: 0 })
	const geometry = useRef(
		new Map<
			string,
			{
				y: number
				height: number
				bodyY: number
				rows: Map<string, { y: number; height: number }>
			}
		>(),
	)
	const [drag, setDrag] = useState<{
		entry: EditorEntry
		props: EditorRowProps
		height: number
	}>()
	const active = useRef<
		| {
				id: string
				pointer: number
				grab: number
				target?: DropTarget
				dropping?: boolean
		  }
		| undefined
	>(undefined)
	const [target, setTarget] = useState<DropTarget>()
	const [position] = useState(() => new Animated.Value(0))
	const [scale] = useState(() => new Animated.Value(1))
	const latest = useRef({ sections, preferences, onChange })
	latest.current = { sections, preferences, onChange }
	const useStyles = useMemo(
		() =>
			Design.createStyles({
				card: {
					backgroundColor: Tokens.default.colors.BACKGROUND_SURFACE_HIGH,
				},
			}),
		[],
	)
	const styles = useStyles()
	const reduced =
		'useReducedMotion' in Stores.AccessibilityStore &&
		Stores.AccessibilityStore.useReducedMotion === true
	function bounds(): SectionBounds[] {
		return latest.current.sections.flatMap(section => {
			const measured = geometry.current.get(section.key)
			if (!measured) return []
			const start = measured.y + measured.bodyY
			return [
				{
					key: section.key,
					y: start,
					height: measured.height - measured.bodyY,
					rows: section.entries.flatMap(entry => {
						const row = measured.rows.get(entry.key)
						return row
							? [
									{
										id: entry.id ?? entry.key,
										movable: !!entry.id,
										y: start + row.y,
										height: row.height,
									},
								]
							: []
					}),
				},
			]
		})
	}
	const preview = getSectionPreview(bounds(), drag?.entry.id ?? '', target)
	function update() {
		const state = active.current
		if (!state || state.dropping) return
		position.setValue(state.pointer - viewport.current.y - state.grab)
		const next = findDropTarget(
			bounds(),
			state.id,
			state.pointer - viewport.current.y + scrollY.current,
		)
		if (
			next?.section !== state.target?.section ||
			next?.before !== state.target?.before
		) {
			barHapticFeedback()
			setTarget(next)
		}
		state.target = next
	}
	function cancel() {
		active.current = undefined
		position.stopAnimation()
		scale.stopAnimation()
		setDrag(undefined)
		setTarget(undefined)
	}
	useEffect(() => {
		if (!drag) return
		// Start after the raised overlay mounts so the lift is visible.
		if (!reduced && !active.current?.dropping) {
			Animated.spring(scale, {
				...spring,
				toValue: 1.025,
				useNativeDriver: true,
			}).start()
		}

		const timer = setInterval(() => {
			const state = active.current
			if (!state || state.dropping) return

			const speed = edgeScrollSpeed(
				state.pointer - viewport.current.y,
				viewport.current.height,
			)
			const next = Math.max(
				0,
				Math.min(
					Math.max(0, contentHeight.current - viewport.current.height),
					scrollY.current + speed,
				),
			)
			if (next === scrollY.current) return
			scrollY.current = next
			scroll.current?.scrollTo({ y: next, animated: false })
			update()
		}, 16)
		return () => clearInterval(timer)
	}, [!!drag])
	useEffect(
		() => () => {
			active.current = undefined
			position.stopAnimation()
			scale.stopAnimation()
		},
		[position, scale],
	)
	function finish() {
		const state = active.current
		if (!state || state.dropping) return
		state.dropping = true
		const drop = state.target
		const commit = () => {
			if (active.current !== state) return
			if (drop) {
				const { sections, preferences, onChange } = latest.current
				onChange(
					moveToSection(
						preferences,
						sections,
						entry => entry.id,
						state.id,
						drop.section,
						drop.before,
					),
				)
			}
			cancel()
		}
		if (!drop || reduced) {
			commit()
			return
		}
		Animated.parallel([
			Animated.timing(position, {
				toValue:
					getSectionPreview(bounds(), state.id, drop).dropY - scrollY.current,
				duration: 140,
				useNativeDriver: true,
			}),
			Animated.timing(scale, {
				toValue: 1,
				duration: 140,
				useNativeDriver: true,
			}),
		]).start(({ finished }) => {
			if (finished) commit()
		})
	}
	return (
		<View
			ref={root}
			collapsable={false}
			style={inSheet ? undefined : { flex: 1 }}
			onLayout={event => {
				viewport.current.height = event.nativeEvent.layout.height
			}}
		>
			<EditorScrollView
				ref={scroll}
				scrollEnabled={!drag}
				nestedScrollEnabled
				removeClippedSubviews={false}
				scrollEventThrottle={16}
				onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
					scrollY.current = event.nativeEvent.contentOffset.y
					update()
				}}
				onContentSizeChange={(_: number, content: number) => {
					contentHeight.current = content
				}}
			>
				{header}
				{sections.map(section => {
					let measured = geometry.current.get(section.key)
					if (!measured) {
						measured = { y: 0, height: 0, bodyY: 0, rows: new Map() }
						geometry.current.set(section.key, measured)
					}
					const layout = measured
					const movement = preview.sections.get(section.key)
					return (
						<MovingView
							key={section.key}
							offset={movement?.offset ?? 0}
							spring={spring}
							reduced={reduced || !drag}
							onLayout={event => {
								if (!active.current)
									Object.assign(layout, event.nativeEvent.layout)
							}}
							style={{
								marginBottom: 16,
								height: drag ? layout.height : undefined,
							}}
						>
							{section.title && (
								<Design.Text
									variant="text-sm/medium"
									style={{ paddingVertical: 8 }}
								>
									{section.title}
								</Design.Text>
							)}
							<View
								onLayout={event => {
									layout.bodyY = event.nativeEvent.layout.y
								}}
								style={[
									styles.card,
									{
										borderRadius: 12,
										overflow: drag ? 'visible' : 'hidden',
										minHeight: 48,
										height: movement?.height,
									},
								]}
							>
								{!section.entries.length && (
									<Design.Text variant="text-sm/medium" style={{ padding: 16 }}>
										Drop here
									</Design.Text>
								)}
								{section.entries.map((entry, index) => {
									const hidden =
										!!entry.id && preferences.hidden.includes(entry.id)
									const props: EditorRowProps = {
										entry,
										hidden,
										slot: index,
										count: section.entries.length,
										onToggle: () =>
											entry.id &&
											onChange({
												...preferences,
												hidden: hidden
													? preferences.hidden.filter(id => id !== entry.id)
													: [...preferences.hidden, entry.id],
											}),
										onStart(pointer) {
											if (!entry.id) return
											const row = layout.rows.get(entry.key)
											if (!row) return
											const state = { id: entry.id, pointer, grab: 0 }
											active.current = state
											root.current?.measure(
												(_, _localY, _width, viewHeight, _pageX, y) => {
													if (active.current !== state) return
													viewport.current = { y, height: viewHeight }
													state.grab =
														pointer -
														y -
														(layout.y + layout.bodyY + row.y - scrollY.current)
													position.setValue(
														layout.y + layout.bodyY + row.y - scrollY.current,
													)
													scale.stopAnimation()
													scale.setValue(1)
													setDrag({ entry, props, height: row.height })
													update()
												},
											)
										},
										onMove(pointer) {
											if (active.current) {
												active.current.pointer = pointer
												update()
											}
										},
										onEnd: finish,
										onCancel: cancel,
										onStep(direction) {
											if (!entry.id) return
											const all = sections.flatMap(group =>
												group.entries
													.filter(row => row.id)
													.map(row => ({ group, row })),
											)
											const from = all.findIndex(
													item => item.row.id === entry.id,
												),
												to = from + direction
											const adjacent = all[to]
											if (!adjacent) return
											const before =
												direction < 0
													? adjacent.row.id
													: all[to + 1]?.group.key === adjacent.group.key
														? all[to + 1].row.id
														: undefined
											onChange(
												moveToSection(
													preferences,
													sections,
													row => row.id,
													entry.id,
													adjacent.group.key,
													before,
												),
											)
										},
									}
									return (
										<MovingView
											key={entry.id ?? entry.key}
											offset={movement?.rows.get(entry.id ?? entry.key) ?? 0}
											spring={spring}
											reduced={reduced || !drag}
											onLayout={event =>
												layout.rows.set(entry.key, event.nativeEvent.layout)
											}
											style={{
												opacity:
													drag?.entry.id === entry.id && entry.id
														? 0
														: hidden
															? 0.4
															: 1,
											}}
										>
											<RowComponent {...props} />
										</MovingView>
									)
								})}
							</View>
						</MovingView>
					)
				})}
				{!!preview.extraHeight && (
					<View style={{ height: preview.extraHeight }} />
				)}
			</EditorScrollView>
			{drag && (
				<AnimatedView
					pointerEvents="none"
					accessibilityElementsHidden
					importantForAccessibility="no-hide-descendants"
					style={[
						styles.card,
						{
							position: 'absolute',
							top: 0,
							left: 0,
							right: 0,
							height: drag.height,
							borderRadius: 12,
							zIndex: 100,
							elevation: 24,
							shadowColor: '#000',
							shadowOpacity: 0.3,
							shadowRadius: 10,
							shadowOffset: { width: 0, height: 5 },
							transform: [{ translateY: position }, { scale }],
						},
					]}
				>
					<RowComponent
						{...drag.props}
						onToggle={ignore}
						onStart={ignore}
						onMove={ignore}
						onEnd={ignore}
						onCancel={ignore}
						onStep={ignore}
					/>
				</AnimatedView>
			)}
		</View>
	)
}
