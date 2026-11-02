import { ReactNativeSafeAreaContext } from '@valenced/externals/react-native-safe-area-context'
import {
	ReactNavigationNative,
	ReactNavigationStack,
} from '@valenced/externals/react-navigation'
import { beforeJSX } from '@valenced/react/jsx-runtime'
import { createElement, isValidElement, useLayoutEffect } from 'react'
import { View } from 'react-native'
import { BAR_HEIGHT, TabBar } from './bar'
import { fullScreenSettings, tabEnabled, useSettings } from './state'
import type { ComponentType, ReactElement } from 'react'
import type { Logger, Props, Tab } from './state'

// Patching the tab screens: render rewriting, the per-screen edits, and the
// wrapper that docks the bar under each screen.

type Render = (this: unknown, ...args: unknown[]) => unknown
type Memo = { $$typeof: symbol; type: Render; compare?: unknown }

// Swap the render of a memo() export. The wrapper calls the original every
// time so Discord's hooks keep running in the same order, then renders our
// output instead. No hooks of our own live in the wrapper, so putting the
// original back on cleanup is safe for mounted instances.
export function swapRender(
	exports: unknown,
	name: string,
	logger: Logger,
	replace: (out: unknown, props: unknown) => unknown,
) {
	const memo = (exports as { default?: Memo } | undefined)?.default
	const original = memo?.type
	if (!memo || typeof original !== 'function') {
		logger.log(`${name} export is not memo(function). Nothing patched.`)
		return
	}
	const wrapped = function (this: unknown, ...args: unknown[]) {
		const out = original.apply(this, args)
		return replace(out, args[0])
	}
	Object.assign(wrapped, { displayName: name })
	memo.type = wrapped
	logger.log(`Patched ${name}`)
	return () => {
		if (memo.type === wrapped) memo.type = original
	}
}

// ---------------------------------------------------------------------------
// Render rewriting
//
// The screens below build their headers and menus from components that are
// not exported. Their element types are taken from the rendered tree and
// swapped for a wrapper (cached per type, so React keeps the same identity)
// that calls the original and edits what it returns. Matching is by function
// name and testID as they are in 352.6; re-check them after a client update.

type Edit = (out: unknown) => unknown

const wrappedTypes = new Map<unknown, unknown>()

function editType(type: unknown, edit: Edit): unknown {
	const cached = wrappedTypes.get(type)
	if (cached) return cached
	const memo =
		typeof type === 'object' && type !== null && 'type' in type
			? (type as Memo)
			: undefined
	const render = (memo ? memo.type : type) as Render
	if (typeof render !== 'function') return type
	const wrapped = function (this: unknown, ...args: unknown[]) {
		return edit(render.apply(this, args))
	}
	Object.assign(wrapped, { displayName: (render as { name?: string }).name })
	const next = memo ? { ...memo, type: wrapped } : wrapped
	wrappedTypes.set(type, next)
	return next
}

function typeName(type: unknown): string | undefined {
	if (typeof type === 'function') {
		const fn = type as { displayName?: string; name?: string }
		return fn.displayName ?? fn.name
	}
	if (typeof type === 'object' && type !== null) {
		const inner =
			(type as { type?: unknown }).type ?? (type as { render?: unknown }).render
		if (inner) return typeName(inner)
	}
}

type Visit = (el: ReactElement<Props>) => ReactElement<Props> | null | undefined

// Walk a rendered tree. `visit` returns undefined to keep the element and
// walk its children, null to drop it, or an element to use as is.
function rewrite(node: unknown, visit: Visit): unknown {
	if (Array.isArray(node)) {
		let changed = false
		const out = node.map(child => {
			const next = rewrite(child, visit)
			if (next !== child) changed = true
			return next
		})
		return changed ? out : node
	}
	if (!isValidElement(node)) return node
	const el = node as ReactElement<Props>
	const result = visit(el)
	if (result !== undefined) return result
	const children = el.props.children
	if (children === undefined) return el
	const next = rewrite(children, visit)
	if (next === children) return el
	return { ...el, props: { ...el.props, children: next } }
}

function swapType(el: ReactElement<Props>, edit: Edit, props?: Props) {
	return {
		...el,
		type: editType(el.type, edit) as never,
		props: props ? { ...el.props, ...props } : el.props,
	}
}

// Notifications: HeaderInner always draws a back button
// (PressableOpacity > LeftBackIconWithBadge). A tab has nowhere to go back to.
function editNotifications(out: unknown) {
	return rewrite(out, el =>
		typeName(el.type) === 'HeaderInner'
			? swapType(el, dropBackButton)
			: undefined,
	)
}

function dropBackButton(out: unknown) {
	return rewrite(out, el => {
		const kids = el.props.children
		if (
			el.props.onPress &&
			!Array.isArray(kids) &&
			isValidElement(kids) &&
			typeName(kids.type) === 'LeftBackIconWithBadge'
		)
			return null
	})
}

// You: UnconnectedYouScreen draws a BackButton (the X) over the banner, and
// YouBannerDecorations draws the Quests / Shop / Nitro / Settings menu.
// Settings has its own tab now, so its button goes.
function editYou(out: unknown) {
	return rewrite(out, el =>
		typeName(el.type) === 'UnconnectedYouScreen'
			? swapType(el, editYouInner)
			: undefined,
	)
}

function editYouInner(out: unknown) {
	return rewrite(out, el => {
		const name = typeName(el.type)
		if (name === 'BackButton') return null
		// paddingBottom is the safe-area inset; the tab bar already covers it.
		if (name === 'YouBannerDecorations')
			return swapType(el, dropSettingsButton, { paddingBottom: 0 })
	})
}

function dropSettingsButton(out: unknown) {
	return rewrite(out, el =>
		el.props.testID === 'you_tab_settings_button' && tabEnabled('settings')
			? null
			: undefined,
	)
}

// Settings: SettingsNavigator is a native stack whose first screen,
// Overview, opens with a close button in the header. Later pages keep their
// back arrow, which goes back to Overview.
function editSettings(out: unknown) {
	return rewrite(out, el =>
		typeName(el.type) === 'SettingsNavigator'
			? swapType(el, editSettingsNavigator)
			: undefined,
	)
}

function editSettingsNavigator(out: unknown) {
	// The close button stays when there is no bar to leave by: with the
	// Settings tab off, Settings is opened from the You menu again, and in
	// full-screen mode the bar is not drawn on this screen at all.
	if (!tabEnabled('settings') || fullScreenSettings()) return out
	return rewrite(out, el => {
		if (el.props.name !== 'Overview' || !('getComponent' in el.props)) return
		const options = el.props.options
		return {
			...el,
			props: {
				...el.props,
				options: (args: unknown) => ({
					...(typeof options === 'function' ? options(args) : options),
					headerLeft: () => null,
					headerBackVisible: false,
				}),
			},
		}
	})
}

const EDITS: Record<Exclude<Tab, 'home'>, Edit> = {
	notifications: editNotifications,
	profile: editYou,
	settings: editSettings,
}

// Notifications, You, and Settings are full screens pushed over the tabs. The
// navigators keep their own reference to the screen function, so swapping
// the export does nothing. Instead every JSX element of that type becomes
// ScreenWithTabs, which renders an edited copy of the screen (through
// React.createElement, which beforeJSX does not see) in a box that stops
// above the bar.
export function withTabBar(
	exports: unknown,
	active: Exclude<Tab, 'home'>,
	logger: Logger,
) {
	const original = (exports as { default?: unknown } | undefined)?.default
	if (typeof original !== 'function') {
		logger.log(`${active} screen export is not a function. Nothing patched.`)
		return
	}
	const screen = editType(original, EDITS[active]) as ComponentType<Props>
	logger.log(`Tab bar under the ${active} screen`)
	return beforeJSX(original as ComponentType<Props>, args => {
		const [, props, key] = args
		return [ScreenWithTabs, { active, screen, props }, key] as never
	})
}

// The tab screens are declared as <Screen name="notifications" | "you" |
// "settings"> in Discord's navigators. Every navigator's Screen is the same
// component from @react-navigation/core, so one hook on it swaps their
// slide-in / slide-up for a plain fade before any transition starts. Settings
// loads through getComponent, so setting the option from inside the screen
// (below) is too late for it. The fade also covers the You screen laying out
// its banner on the first frames.
const TAB_SCREENS = new Set(['notifications', 'you', 'settings'])

export function fadeTabScreens(logger: Logger): (() => unknown)[] {
	const Screen = (
		ReactNavigationStack as unknown as {
			createStackNavigator?: () => { Screen?: unknown }
		}
	)?.createStackNavigator?.()?.Screen
	if (typeof Screen !== 'function') {
		logger.log('No react-navigation Screen component. Tabs will animate.')
		return []
	}
	return [
		beforeJSX(Screen as ComponentType<Props>, args => {
			const props = args[1] as Props
			if (!TAB_SCREENS.has(props?.name as string)) return args
			const options = props.options
			const fade = (input: unknown) => ({
				...(typeof options === 'function'
					? options(input)
					: (options as object)),
				animation: 'fade',
			})
			return [args[0], { ...props, options: fade }, args[2]] as never
		}),
	]
}

function ScreenWithTabs({
	active,
	screen,
	props,
}: {
	active: Tab
	screen: ComponentType<Props>
	props: Props
}) {
	const insets = ReactNativeSafeAreaContext?.useSafeAreaInsets?.()
	const navigation = ReactNavigationNative.useNavigation() as {
		setOptions?: (options: Props) => void
	}
	// Tabs fade instead of sliding. Set before the first paint; the Screen
	// hook above already covers the first open of each route.
	useLayoutEffect(() => {
		navigation?.setOptions?.({ animation: 'fade' })
	}, [navigation])
	const settings = useSettings()

	// createElement, not JSX: the screen type must not go back through the
	// patched JSX runtime.
	const content = createElement(screen, props)

	// Full-screen Settings: no bar and no reserved space; Discord's close
	// button (kept by editSettingsNavigator) leads back out.
	if (active === 'settings' && settings.fullScreenSettings) return content

	const reserved = BAR_HEIGHT + (insets?.bottom ?? 0)
	return (
		<View style={{ flex: 1 }}>
			<View style={{ flex: 1, marginBottom: reserved }}>{content}</View>
			<TabBar active={active} />
		</View>
	)
}
