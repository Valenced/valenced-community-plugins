import { getModules } from '@valenced/modules/finders'
import { createFilterGenerator } from '@valenced/modules/finders/filters'
import { after, instead } from '@valenced/patcher'
import { getErrorStack } from '@valenced/utils/error'
import { findInReactFiber } from '@valenced/utils/react'
import {
	cloneElement,
	isValidElement,
	useCallback,
	useEffect,
	useReducer,
} from 'react'
import { StyleSheet, View } from 'react-native'
import SettingsComponent from './settings'
import { CounterSquare, clamp, DefaultSettings, FontSize } from './shared'
import { estimateParts, limit, maxParts, patchSplit } from './split'
import type {
	Filter,
	FilterGenerator,
	FilterScopes,
} from '@valenced/modules/finders/filters'
import type {
	FC,
	MemoExoticComponent,
	ReactElement,
	ReactNode,
	Ref,
} from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import type { Settings } from './shared'

interface CharCounterHandle {
	onMessageLengthChanged(length: number): void
}

interface ContainerProps {
	collapsable?: boolean
	onLayout?: unknown
	children: ReactNode[]
}

interface FillProps {
	pointerEvents?: string
	children?: ReactNode
	style?: StyleProp<ViewStyle>
}

const TypingLineHeight = 26

let settings: Settings = DefaultSettings

let length = 0
const listeners = new Set<() => void>()

function setLength(value: number) {
	const next = Math.max(value, 0)
	if (next === length) return
	length = next
	for (const listener of listeners) listener()
}

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: {
		load: true,
		default: DefaultSettings,
	},
	start({ cleanup, jsonStorage, plugin }) {
		// The settings page writes through its own handle, which this handle's cache doesn't see
		const take = (patch?: Partial<Settings>) => {
			if (patch) settings = { ...settings, ...patch }
		}
		settings = { ...DefaultSettings, ...jsonStorage.cache }
		cleanup(jsonStorage.subscribe(patch => take(patch as Partial<Settings>)))
		jsonStorage.get().then(take, () => {})

		const reported = new Set<string>()
		const report = (message: string, error?: unknown) => {
			const key = `${message} ${error instanceof Error ? error.message : error}`
			if (reported.has(key)) return
			reported.add(key)
			plugin.reportError(
				error === undefined ? message : `${message} ${getErrorStack(error)}`,
			)
		}

		cleanup(
			// modules/chat_input/native/accessories/ChatInputCharCounter.tsx
			getModules(
				withMemoizedName<{ ref?: Ref<CharCounterHandle> }>(
					'ChatInputCharCounter',
				),
				ChatInputCharCounter => {
					const wrapped = new WeakSet<CharCounterHandle>()

					cleanup(
						instead(ChatInputCharCounter, 'type', function (args, original) {
							const [props] = args
							const { ref } = props

							// Discord calls onMessageLengthChanged on every change to the text
							const passRef = useCallback(
								(handle: CharCounterHandle | null) => {
									if (handle && !wrapped.has(handle)) {
										const onMessageLengthChanged = handle.onMessageLengthChanged
										handle.onMessageLengthChanged = value => {
											setLength(value)
											return onMessageLengthChanged.call(handle, value)
										}
										wrapped.add(handle)
									}
									if (typeof ref === 'function') ref(handle)
									else if (ref) ref.current = handle
								},
								[ref],
							)

							// Discord's hooks still run for the handle, but its "-N" isn't drawn
							Reflect.apply(original, this, [{ ...props, ref: passRef }])
							useEffect(() => () => setLength(0), [])
							return null
						}),
					)
				},
			),
			// modules/chat_input/native/ChatInput.tsx
			getModules(withMemoizedName('ChatInput'), ChatInput => {
				let placed = false

				cleanup(
					after(ChatInput, 'type', tree => {
						if (!isValidElement(tree)) return tree
						const container = findInReactFiber(tree, isContainer)
						if (!container) {
							if (!placed)
								report(
									'Chat input layout not recognised; the counter is hidden',
								)
							return tree
						}
						placed = true

						const typing = container.props.children.some(isTypingFill)
						return replaceElement(tree, container, element =>
							cloneElement(
								element,
								undefined,
								...container.props.children,
								<Badge key="char-counter" typing={typing} />,
							),
						)
					}),
				)
			}),
		)

		patchSplit(cleanup, () => settings, report)
	},
	SettingsComponent,
})

function Badge({ typing }: { typing: boolean }) {
	const [, redraw] = useReducer((n: number) => n + 1, 0)
	useEffect(() => {
		listeners.add(redraw)
		return () => {
			listeners.delete(redraw)
		}
	}, [])

	const s = settings
	const max = limit()
	const near = length >= max * 0.9
	if (length <= 0 || (s.onlyNearLimit && !near)) return null

	const over = length > max
	const parts =
		over && s.split && estimateParts(length, max) <= maxParts(s)
			? estimateParts(length, max)
			: 0

	return (
		<View
			pointerEvents="none"
			style={{
				position: 'absolute',
				bottom: '100%',
				marginBottom: 8 + (typing ? TypingLineHeight : 0),
				...(s.side === 'right' ? { right: 16 } : { left: 16 }),
			}}
		>
			<CounterSquare
				text={label(length, max, s.show, parts)}
				color={
					over && !parts
						? 'text-feedback-critical'
						: near
							? 'text-feedback-warning'
							: 'text-muted'
				}
				fontSize={clamp(s.fontSize, FontSize)}
			/>
		</View>
	)
}

// Hermes' toLocaleString doesn't always group digits
const grouped = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
const characters = (n: number) =>
	`${grouped(n)} ${n === 1 ? 'character' : 'characters'}`

function label(
	length: number,
	max: number,
	show: Settings['show'],
	parts: number,
) {
	if (length > max)
		return parts
			? `${parts} messages`
			: `${characters(length - max)} over the limit`
	if (show === 'left') return `${characters(max - length)} left`
	if (show === 'limit') return `${grouped(length)} / ${characters(max)}`
	return characters(length)
}

// The chat input's root view, which holds the message box and everything above it
function isContainer(node: unknown): node is ReactElement<ContainerProps> {
	if (!isValidElement<Partial<ContainerProps>>(node)) return false
	const { props } = node
	return (
		props.collapsable === false &&
		typeof props.onLayout === 'function' &&
		Array.isArray(props.children)
	)
}

// The solid fill Discord draws behind the "…is typing" line
function isTypingFill(node: ReactNode): boolean {
	if (!isValidElement<FillProps>(node)) return false
	const { props } = node
	if (props.pointerEvents !== 'none' || props.children != null || !props.style)
		return false
	const style = StyleSheet.flatten(props.style) ?? {}
	return (
		style.position === 'absolute' &&
		style.top === 0 &&
		style.bottom === 0 &&
		style.backgroundColor != null
	)
}

// React Compiler caches rendered trees, so the path to the replaced element is cloned
function replaceElement(
	node: ReactNode,
	target: ReactElement,
	replacer: (element: ReactElement) => ReactNode,
): ReactNode {
	if (Array.isArray(node)) {
		for (let i = 0; i < node.length; i++) {
			const result = replaceElement(node[i], target, replacer)
			if (result === node[i]) continue
			const copy = node.slice()
			copy[i] = result
			return copy
		}
		return node
	}

	if (!isValidElement<{ children?: ReactNode }>(node)) return node
	if (node === target) return replacer(node)

	const { children } = node.props
	if (children == null) return node
	const result = replaceElement(children, target, replacer)
	if (result === children) return node

	return Array.isArray(result)
		? cloneElement(node, undefined, ...result)
		: cloneElement(node, undefined, result)
}

// withName can't see through memo()
const withMemoizedName = createFilterGenerator(
	([name], _, exports) =>
		typeof exports?.type === 'function' && exports.type.displayName === name,
	([name]) => `bleelblep.char-counter.memoizedName(${name})`,
) as FilterGenerator<
	<P = object>(
		name: string,
	) => Filter<{
		Result: MemoExoticComponent<FC<P>>
		Scopes: [typeof FilterScopes.Initialized]
	}>
>
