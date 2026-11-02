import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { ReactNativeSafeAreaContext } from '@valenced/externals/react-native-safe-area-context'
import { beforeJSX } from '@valenced/react/jsx-runtime'
import { cloneElement, createElement, isValidElement } from 'react'
import { StyleSheet, View } from 'react-native'
import type { ReactElement, ReactNode } from 'react'

// Read from the Hermes bundles of Discord 329.13 Stable (the old bar) and
// 352.6 Alpha (floating only). Notes are in docs/DEVELOPMENT.md, task 1.
//
// 352.6 ChatInput.tsx exports memo(ChatInput) and always renders:
//
//   <View style=[anim, overflowVisible, floatingScrimOverlap]>      root
//     <ChatInputScrimGradient gradientHeight scrimBase />           fades messages
//     ...
//     <FloatingChatInputContainer style=[container, floatingContainer]>
//       <View style=[floatingInputBox, pressed?, typing?]>          the pill
//         <ChatInputContextBar />  [EmojiSuggestionBar]
//         <View style=floatingMainContents>                         the row
//           [<View {paddingBottom, paddingLeft}><ChatInputActions/></View>]
//           <View style=[inputFlat, {paddingBottom}]>{TextField}</View>
//           [<View {paddingBottom}><ChatInputRightActions/></View>]  emoji
//           <ChatInputSendButton />  <ChatCounter />
//
// `container` is still the 329.13 strip (BACKGROUND_BASE_LOWER, 1px
// BORDER_SUBTLE top border, PX_8 vertical padding). `floatingContainer` is
// what makes it transparent, so dropping it brings the strip back.
//
// 329.13 drew the row as [round buttons] [input pill: field + emoji]
// [round mic/send]. We strip the outer pill chrome, wrap the field and the
// emoji slot in the old pill, and put the buttons back on round fills.
// 352.6 no longer reads CHAT_INPUT_ACTION_BUTTON_BACKGROUND anywhere, so the
// circles have to be drawn here.

const CHAT_INPUT_PATH = 'modules/chat_input/native/ChatInput.tsx'

// DCDChatList passes floatingChatInputEnabled: true as a literal so messages
// scroll under the pill. The docked bar takes real space, so turn it off.
const CHAT_LIST_PATHS = [
	'../discord_common/js/packages/rtn-codegen/js/ChatListNativeComponent.tsx',
	'discord_common/js/packages/rtn-codegen/js/ChatListNativeComponent.tsx',
]

type Style = Record<string, unknown>
type Logger = { log: (...args: unknown[]) => void }
type Render = (this: unknown, ...args: unknown[]) => unknown
type Props = Record<string, unknown> & { style?: unknown; children?: ReactNode }
// Colors of the floating box we strip. The old pill and buttons reuse them,
// so they follow the theme. 352.6 stock pill is #242429 on dark; the 329.13
// pill and buttons measured #26262e on the same phone.
type Paint = { background?: unknown; border?: unknown }

type Pass = {
	paint: Paint
	// Safe-area bottom inset (nav bar), painted in the bar color like 329.13.
	insetBottom: number
	report: Record<string, boolean>
}

// Undo for floatingInputBox (+ its pressed/typing variants), applied last.
const BOX_RESET: Style = {
	backgroundColor: 'transparent',
	borderWidth: 0,
	borderColor: 'transparent',
	borderRadius: 0,
	overflow: 'visible',
	shadowOpacity: 0,
	elevation: 0,
	// FloatingChatInputContainer layers an animated paddingBottom over the
	// strip's paddingVertical: 8, which zeroes the bottom padding while the
	// keyboard is closed. The box is inside that view, so pad here instead.
	paddingBottom: 8,
}

// 329.13 containerInner was a bare row. The strip already pads the sides,
// and the item margins below do the spacing.
const ROW_RESET: Style = { paddingHorizontal: 0, paddingVertical: 0, gap: 0 }

// 329.13 token resolvers return one value with the visual refresh on and
// another with it off. The old bar is the "off" column. 352.6 still has
// these token names but they now return the "on" values (32, 8, 1, 8, 0),
// so they are pinned here instead of read at runtime.
//   CHAT_INPUT_ACTION_BUTTON_SIZE        40   (on: 32)
//   CHAT_INPUT_BORDER_RADIUS             24   (on: 8)
//   CHAT_INPUT_PILL_BORDER_WIDTH          0   (on: 1)
//   CHAT_INPUT_PILL_MARGIN_HORIZONTAL     4   (on: 8)
//   CHAT_INPUT_PILL_PADDING               2   (on: 0)
// Checked on a 384 dpi Pixel 9: buttons 96 px (40 dp), 19 px (8 dp) apart.
const OLD = {
	buttonSize: 40,
	pillRadius: 24,
	pillBorder: 0,
	pillMargin: 4,
	pillPadding: 2,
	buttonMargin: 4,
}

let docked = false

export default plugin({
	start({ cleanup, logger }) {
		logger.log('Chatbar Restore started')

		cleanup(
			getModuleWithImportedPath(CHAT_INPUT_PATH, moduleExports => {
				const undo = wrapChatInput(moduleExports, logger)
				if (undo) cleanup(undo)
			}),
		)

		for (const path of CHAT_LIST_PATHS) {
			cleanup(
				getModuleWithImportedPath(path, moduleExports => {
					const type = (moduleExports as { default?: unknown } | undefined)
						?.default
					if (type == null) return
					logger.log('Chat list inset hooked', path)
					cleanup(
						beforeJSX(type as Parameters<typeof beforeJSX>[0], args => {
							const props = args[1] as Props | undefined
							if (docked && props?.floatingChatInputEnabled) {
								args[1] = { ...props, floatingChatInputEnabled: false }
							}
							return args
						}),
					)
				}),
			)
		}

		cleanup(() => {
			docked = false
		})
	},
	stop({ logger }) {
		this.requireReload()
		logger.log('Chatbar Restore stopped')
	},
})

function wrapChatInput(moduleExports: unknown, logger: Logger) {
	const memo = (moduleExports as { default?: { type?: unknown } } | undefined)
		?.default
	const render = memo?.type
	if (!memo || typeof render !== 'function') {
		logger.log('ChatInput export is not memo(function). Nothing patched.')
		return
	}
	const original = render as Render
	let reported = false

	const useInsets = ReactNativeSafeAreaContext?.useSafeAreaInsets

	const wrapped = function ChatInput(this: unknown, ...args: unknown[]) {
		// Called on every render (or never) so the hook order never changes.
		const insets = useInsets?.()
		const tree = original.apply(this, args)
		const pass: Pass = {
			paint: {},
			insetBottom: insets?.bottom ?? 0,
			report: {
				bar: false,
				box: false,
				row: false,
				pill: false,
				actions: false,
				send: false,
			},
		}
		const next = dock(tree as ReactNode, pass)
		if (!reported) {
			reported = true
			const summary = JSON.stringify({ ...pass.report, paint: pass.paint })
			logger.log('First docked render', summary)
		}
		return next
	}
	Object.assign(wrapped, { displayName: 'ChatInput' })

	memo.type = wrapped
	docked = true
	logger.log('Wrapped ChatInput render')
	return () => {
		if (memo.type === wrapped) memo.type = original
		docked = false
	}
}

function dock(node: ReactNode, pass: Pass): ReactNode {
	if (Array.isArray(node)) {
		let changed = false
		const out = node.map(child => {
			const next = dock(child, pass)
			if (next !== child) changed = true
			return next
		})
		return changed ? out : node
	}
	if (!isValidElement(node)) return node

	const element = node as ReactElement<Props>
	const props = element.props

	// The fade and the solid fill that sit behind a floating pill.
	if ('gradientHeight' in props && 'scrimBase' in props) return null
	if (props.pointerEvents === 'none' && isAbsoluteFill(flatten(props.style)))
		return null

	const entries = styleEntries(props.style)
	let style: unknown[] | null = null
	let isRow = false
	let isBar = false

	if (entries) {
		const kept = entries.filter(entry => {
			const flat = flatten(entry)
			if (isFloatingContainer(flat)) {
				pass.report.bar = true
				isBar = true
				return false
			}
			return !isScrimOverlap(flat)
		})
		const flats = kept.map(flatten)
		const box = flats.find(isFloatingInputBox)
		if (box) {
			pass.report.box = true
			pass.paint = { background: box.backgroundColor, border: box.borderColor }
			kept.push(BOX_RESET)
		}
		if (flats.some(isMainRow)) {
			pass.report.row = true
			isRow = true
			kept.push(ROW_RESET)
		}
		if (kept.length !== entries.length) style = kept
	}

	const children = props.children
	let nextChildren = isRow ? oldRow(children, pass) : dock(children, pass)
	if (isBar && style) {
		const skirt = barSkirt(style, pass)
		if (skirt) nextChildren = [nextChildren, skirt]
	}
	if (!style && nextChildren === children) return element

	const patch: Partial<Props> | undefined = style ? { style } : undefined
	return Array.isArray(nextChildren)
		? cloneElement(element, patch, ...nextChildren)
		: cloneElement(element, patch, nextChildren)
}

// [actions?, field, emoji?, send, counter]
//   -> [circle(actions)?, pill(field, emoji?), circle(send), counter]
function oldRow(children: ReactNode, pass: Pass) {
	if (!Array.isArray(children)) return dock(children, pass)
	const kids = children.map(child => dock(child, pass))
	const fieldIndex = kids.findIndex(kid => hasStyle(kid, isInputFlat))
	if (fieldIndex < 0) return kids

	const field = kids[fieldIndex] as ReactElement<Props>
	const emojiIndex = hasStyle(kids[fieldIndex + 1], isPaddingOnly)
		? fieldIndex + 1
		: -1

	// 329.13 inputDefault without the refresh was { flex: 1, marginLeft: 6 }:
	// that is the gap between the pill edge and "Message @...". The 2 dp
	// paddingBottom only lined the text up inside the floating pill.
	const flatField = cloneElement(field, {
		style: [
			field.props.style,
			{ marginLeft: 6, marginRight: 0, paddingBottom: 0 },
		],
	})
	const emoji =
		emojiIndex >= 0 ? (kids[emojiIndex] as ReactElement<Props>) : null
	// Center gift / emoji in the 40 dp pill like 329.13 rightAccessory.
	const centeredEmoji = emoji
		? cloneElement(emoji, {
				style: [
					emoji.props.style,
					{ paddingBottom: 0, justifyContent: 'center', alignSelf: 'stretch' },
				],
			})
		: null
	const pill = createElement(
		View,
		{ style: pillStyle(pass) as never },
		flatField,
		centeredEmoji,
	)
	pass.report.pill = true

	const out: ReactNode[] = []
	kids.forEach((kid, index) => {
		if (index === fieldIndex) out.push(pill)
		else if (index === emojiIndex) return
		else if (index < fieldIndex && hasStyle(kid, isPaddingOnly)) {
			// Wrapper around ChatInputActions (the + button).
			pass.report.actions = true
			out.push(circle(kid as ReactElement<Props>, pass, true))
		} else if (index > fieldIndex && isSendButton(kid)) {
			pass.report.send = true
			out.push(circle(kid as ReactElement<Props>, pass, false))
		} else out.push(kid)
	})
	return out
}

// The strip in 329.13 ran under the gesture bar. 352.6 leaves that inset
// to the window background below the input, so paint it in the bar color.
function barSkirt(style: unknown[], pass: Pass) {
	if (pass.insetBottom <= 0) return null
	const background = flatten(style)?.backgroundColor
	if (background == null) return null
	return createElement(View, {
		pointerEvents: 'none',
		style: {
			position: 'absolute',
			left: 0,
			right: 0,
			top: '100%',
			height: pass.insetBottom,
			backgroundColor: background,
		} as never,
	})
}

function circle(kid: ReactElement<Props>, pass: Pass, ownsStyle: boolean) {
	const fill = circleStyle(pass)
	// The actions wrapper is a plain View we can restyle in place. Its
	// padding lined the icon up inside the floating pill; drop it.
	if (ownsStyle) {
		return cloneElement(kid, {
			style: [
				kid.props.style,
				{ padding: 0, paddingBottom: 0, paddingLeft: 0 },
				fill,
			],
		})
	}
	return createElement(View, { style: fill as never }, kid)
}

// Each round button in 329.13: 40 dp, 4 dp margin on each side.
function circleStyle(pass: Pass): Style {
	return {
		width: OLD.buttonSize,
		height: OLD.buttonSize,
		borderRadius: OLD.buttonSize / 2,
		marginHorizontal: OLD.buttonMargin,
		alignItems: 'center',
		justifyContent: 'center',
		overflow: 'hidden',
		backgroundColor: pass.paint.background,
	}
}

// 329.13 `input`: row, stretch, flex 1, overflow hidden, plus the pinned
// sizes above. minHeight = button size - 2 * border, so the field is
// exactly as tall as the round buttons.
function pillStyle(pass: Pass): Style {
	return {
		flex: 1,
		flexDirection: 'row',
		alignItems: 'stretch',
		overflow: 'hidden',
		borderRadius: OLD.pillRadius,
		borderWidth: OLD.pillBorder,
		borderColor: pass.paint.border,
		paddingHorizontal: OLD.pillPadding,
		marginHorizontal: OLD.pillMargin,
		minHeight: OLD.buttonSize - 2 * OLD.pillBorder,
		backgroundColor: pass.paint.background,
	}
}

// Style matchers. Each takes one entry of a style array, flattened.
// Key sets come from the 352.6 createStyles sheet.

function isFloatingContainer(s: Style | null) {
	return Boolean(
		s &&
			s.borderTopWidth === 0 &&
			s.backgroundColor === 'transparent' &&
			s.borderColor === 'transparent' &&
			s.paddingVertical === 0 &&
			s.overflow === 'visible' &&
			'paddingHorizontal' in s &&
			'borderRadius' in s,
	)
}

function isFloatingInputBox(s: Style | null): s is Style {
	return Boolean(
		s &&
			s.flexDirection === 'column' &&
			s.overflow === 'hidden' &&
			'borderRadius' in s &&
			'borderWidth' in s &&
			'backgroundColor' in s,
	)
}

function isMainRow(s: Style | null) {
	return Boolean(
		s &&
			s.flexDirection === 'row' &&
			s.alignItems === 'flex-end' &&
			'gap' in s &&
			'paddingHorizontal' in s &&
			'paddingVertical' in s,
	)
}

function isInputFlat(s: Style | null) {
	return Boolean(
		s && s.flex === 1 && s.justifyContent === 'center' && 'marginLeft' in s,
	)
}

// floatingScrimOverlap is { marginTop: -gradientHeight / 2 } and nothing else.
function isScrimOverlap(s: Style | null) {
	if (!s) return false
	const keys = Object.keys(s)
	return (
		keys.length === 1 &&
		keys[0] === 'marginTop' &&
		typeof s.marginTop === 'number' &&
		s.marginTop < 0
	)
}

// The action and emoji wrappers are { paddingBottom[, paddingLeft] }.
// The values can be undefined, so only the keys are checked.
function isPaddingOnly(s: Style | null) {
	if (!s) return false
	const keys = Object.keys(s)
	return keys.length > 0 && keys.every(key => key.startsWith('padding'))
}

function isAbsoluteFill(s: Style | null) {
	return Boolean(
		s &&
			s.position === 'absolute' &&
			s.top === 0 &&
			s.left === 0 &&
			s.right === 0 &&
			s.bottom === 0 &&
			s.backgroundColor != null,
	)
}

// ChatInputSendButton props: canSendVoiceMessage, onSendMessage, ...
function isSendButton(node: ReactNode) {
	if (!isValidElement(node)) return false
	const props = (node as ReactElement<Props>).props
	return 'onSendMessage' in props && 'canSendVoiceMessage' in props
}

function hasStyle(node: ReactNode, test: (s: Style | null) => boolean) {
	if (!isValidElement(node)) return false
	return (
		styleEntries((node as ReactElement<Props>).props.style)?.some(entry =>
			test(flatten(entry)),
		) ?? false
	)
}

function styleEntries(style: unknown): unknown[] | null {
	if (style == null || style === false) return null
	return Array.isArray(style) ? style : [style]
}

function flatten(style: unknown): Style | null {
	if (style == null || style === false) return null
	try {
		const flat = StyleSheet.flatten(style as never)
		return flat && typeof flat === 'object' ? (flat as Style) : null
	} catch {
		return null
	}
}
