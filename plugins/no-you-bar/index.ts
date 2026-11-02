import Page from '@valenced/components/Page'
import { Tokens } from '@valenced/discord/common/tokens'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import {
	getModuleWithImportedPath,
	lookupModuleWithImportedPath,
} from '@valenced/discord/utils/modules/finders'
import { ReactNativeSafeAreaContext } from '@valenced/externals/react-native-safe-area-context'
import {
	ReactNavigationNative,
	ReactNavigationStack,
} from '@valenced/externals/react-navigation'
import { beforeJSX } from '@valenced/react/jsx-runtime'
import {
	createElement,
	isValidElement,
	useEffect,
	useLayoutEffect,
	useState,
} from 'react'
import { Pressable, View } from 'react-native'
import type { ComponentType, ReactElement, ReactNode } from 'react'

// Read from the Hermes bundle of Discord 352.6 Alpha. Notes are in
// docs/DEVELOPMENT.md, task 2.
//
// 352.6 has no tab navigator left. TabsNavigator.tsx (still in 329.13) is gone,
// and the Tabs V2 / You Tab experiments are not in the bundle. Navigation is:
//
//   root stack
//     main (MainNavigator)
//       tabs (MainTabs)
//         YouBarStackNavigator: guilds | icymi | notifications
//     you        <- RootNavigatorScreen.YOU (YouScreen)
//     settings   <- RootNavigatorScreen.SETTINGS (Settings > SettingsNavigator)
//
// The You bar (memo(YouBarThemed), you_bar/YouBar.tsx) floats over `guilds`.
// Its avatar opens `you`, its bell pushes `notifications`. Screens leave
// useYouBarTotalHeight() (56 + bottom inset) free at the bottom, so a docked
// bar of the same height fits without moving any list.
//
// The bar replaces the You bar on `guilds`, and is drawn under the
// Notifications, You, and Settings screens so it stays put on every tab.

const BASE = 'modules/main_tabs_v2/'
const ICONS = 'design/components/Icon/native/redesign/generated/'
const AVATAR = 'design/void/Avatar/native/Avatar.tsx'

const BAR_HEIGHT = 56
// AvatarSizes.TABS_22: the size Discord kept for the old You tab.
const TAB_AVATAR_SIZE = 'tabs22'

type Logger = { log: (...args: unknown[]) => void }
type Props = Record<string, unknown>
type Render = (this: unknown, ...args: unknown[]) => unknown
type Memo = { $$typeof: symbol; type: Render; compare?: unknown }
type Icon = ComponentType<{ size?: string; color?: unknown }>
type NavRoute = {
	name: string
	key: string
	params?: unknown
	state?: NavState
}
type NavState = { key: string; index: number; routes: NavRoute[] }
type RootRef = {
	isReady?: () => boolean
	getRootState: () => NavState
	dispatch: (action: unknown) => void
	navigate: (name: string, params?: unknown) => void
}
type Badge = { value?: number; showDot?: boolean }
type Tab = 'home' | 'notifications' | 'profile' | 'settings'
// Home is always on: it is the only way back to DMs and servers.
type Toggleable = Exclude<Tab, 'home'>
type Settings = {
	showLabels: boolean
	tabs: Record<Toggleable, boolean>
}

const DEFAULT_SETTINGS: Settings = {
	showLabels: true,
	tabs: { notifications: true, profile: true, settings: true },
}
type Storage = {
	cache?: unknown
	subscribe: (callback: () => void) => () => void
	set: (value: Partial<Settings>) => unknown
}

const found: {
	root?: () => RootRef | undefined
	badge?: () => Badge
	storage?: Storage
} = {}

// Icon modules load lazily. Only modules Discord has already run can be
// found by path, so each slot takes the first one that is there. ChatIcon,
// BellIcon, and SettingsIcon are loaded by the time the home screen renders
// on 352.6.
const ICON_CHOICES = {
	home: ['HomeIcon', 'ClydeIcon', 'ChatIcon'],
	bell: ['BellIcon'],
	user: ['UserCircleIcon', 'UserIcon'],
	settings: ['SettingsIcon'],
} as const

const iconCache: Partial<Record<keyof typeof ICON_CHOICES, Icon>> = {}

function icon(slot: keyof typeof ICON_CHOICES): Icon | undefined {
	if (iconCache[slot]) return iconCache[slot]
	for (const name of ICON_CHOICES[slot]) {
		const [exports] = lookupModuleWithImportedPath(
			`${ICONS}${name}.tsx`,
		) as unknown[]
		const fn = (exports as Record<string, unknown> | undefined)?.[name]
		if (typeof fn === 'function') {
			iconCache[slot] = fn as Icon
			return iconCache[slot]
		}
	}
}

function avatarComponent(): ComponentType<Props> | undefined {
	const [exports] = lookupModuleWithImportedPath(AVATAR) as unknown[]
	const fn = (exports as { default?: unknown } | undefined)?.default
	return fn ? (fn as ComponentType<Props>) : undefined
}

function currentUser() {
	const store = (Stores as Record<string, { getCurrentUser?: () => unknown }>)
		.UserStore
	return store?.getCurrentUser?.()
}

// The tokens module is an ES module; the token tables are on `default`.
function tokenColors(): Record<string, unknown> {
	return (
		(Tokens as { default?: { colors?: Record<string, unknown> } }).default
			?.colors ?? {}
	)
}

const sheet = (colors = tokenColors()) => ({
	bar: {
		position: 'absolute',
		left: 0,
		right: 0,
		bottom: 0,
		flexDirection: 'row',
		backgroundColor: colors.BACKGROUND_BASE_LOWER,
		borderTopWidth: 1,
		borderTopColor: colors.BORDER_SUBTLE,
	},
	tab: {
		flex: 1,
		height: BAR_HEIGHT,
		alignItems: 'center',
		justifyContent: 'center',
		gap: 2,
	},
	iconBox: {
		height: 24,
		minWidth: 24,
		alignItems: 'center',
		justifyContent: 'center',
	},
	badge: {
		position: 'absolute',
		top: -4,
		left: 14,
		minWidth: 16,
		height: 16,
		paddingHorizontal: 4,
		borderRadius: 8,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: colors.STATUS_DANGER,
	},
	dot: {
		position: 'absolute',
		top: -2,
		left: 18,
		width: 8,
		height: 8,
		borderRadius: 4,
		backgroundColor: colors.STATUS_DANGER,
	},
})

type Styles = Record<keyof ReturnType<typeof sheet>, object>

// Discord's design API is only there after init, so the sheet is built on
// first render.
let useStylesHook: (() => Styles) | undefined
function useStyles(): Styles {
	useStylesHook ??= Design.createStyles(sheet() as never) as () => Styles
	return useStylesHook()
}

export default plugin({
	jsonStorage: {
		load: true,
		default: DEFAULT_SETTINGS,
	},
	start({ cleanup, logger, jsonStorage }) {
		logger.log('NoYouBar started')
		found.storage = jsonStorage as unknown as Storage

		const undoScreens = fadeTabScreens(logger)
		cleanup(
			() => {
				found.storage = undefined
			},
			...undoScreens,
			getModuleWithImportedPath(
				`${BASE}RootNavigationRef.native.tsx`,
				exports => {
					const mod = exports as { getRootNavigationRef?: () => RootRef }
					found.root = () => mod.getRootNavigationRef?.()
				},
			),
			getModuleWithImportedPath(
				`${BASE}native/tabs/notifications/useNotificationsTabBadge.tsx`,
				exports => {
					found.badge = (exports as { default?: () => Badge }).default
				},
			),
			getModuleWithImportedPath(`${BASE}native/you_bar/YouBar.tsx`, exports => {
				const undo = swapRender(exports, 'YouBarThemed', logger, out =>
					createElement(TabBar, {
						active: 'home',
						fallback: out as ReactNode,
					}),
				)
				if (undo) cleanup(undo)
			}),
			getModuleWithImportedPath(
				`${BASE}native/tabs/notifications/Notifications.tsx`,
				exports => {
					const undo = withTabBar(exports, 'notifications', logger)
					if (undo) cleanup(undo)
				},
			),
			getModuleWithImportedPath(
				`${BASE}native/tabs/you/YouScreen.tsx`,
				exports => {
					const undo = withTabBar(exports, 'profile', logger)
					if (undo) cleanup(undo)
				},
			),
			getModuleWithImportedPath(
				`${BASE}native/tabs/settings/Settings.tsx`,
				exports => {
					const undo = withTabBar(exports, 'settings', logger)
					if (undo) cleanup(undo)
				},
			),
		)
	},
	stop({ logger }) {
		this.requireReload()
		logger.log('NoYouBar stopped')
	},
	SettingsComponent() {
		const settings = useSettings()
		const setTab = (tab: Toggleable, value: boolean) =>
			found.storage?.set({ tabs: { ...settings.tabs, [tab]: value } })
		const tabRow = (tab: Toggleable, label: string, subLabel: string) =>
			createElement(Design.TableSwitchRow, {
				key: tab,
				label,
				subLabel,
				value: settings.tabs[tab],
				// You and Settings cannot both be off, or settings would be
				// unreachable.
				disabled:
					(tab === 'profile' && !settings.tabs.settings) ||
					(tab === 'settings' && !settings.tabs.profile),
				onValueChange: (value: boolean) => setTab(tab, value),
			})
		return createElement(
			Page,
			null,
			createElement(
				Design.TableRowGroup,
				{ title: 'Tab bar' } as never,
				createElement(Design.TableSwitchRow, {
					label: 'Show tab labels',
					subLabel: 'Names under the tab icons.',
					value: settings.showLabels,
					onValueChange: (value: boolean) => {
						found.storage?.set({ showLabels: value })
					},
				}),
			),
			createElement(
				Design.TableRowGroup,
				{ title: 'Tabs' } as never,
				createElement(Design.TableRow, {
					label: 'Home',
					subLabel: 'Always on. It is the way back to DMs and servers.',
				}),
				tabRow('notifications', 'Notifications', 'Mentions and replies.'),
				tabRow(
					'profile',
					'You',
					'Your profile, Quests, Shop, and Nitro. Needs Settings on to turn off.',
				),
				tabRow(
					'settings',
					'Settings',
					'When off, Settings goes back in the menu on the You tab. Needs You on to turn off.',
				),
			),
		)
	},
})

// Swap the render of a memo() export. The wrapper calls the original every
// time so Discord's hooks keep running in the same order, then renders our
// output instead. No hooks of our own live in the wrapper, so putting the
// original back on cleanup is safe for mounted instances.
function swapRender(
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
	// With the Settings tab off, Settings is opened from the You menu again,
	// so it keeps Discord's close button.
	if (!tabEnabled('settings')) return out
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
function withTabBar(
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

function fadeTabScreens(logger: Logger): (() => unknown)[] {
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

	const reserved = BAR_HEIGHT + (insets?.bottom ?? 0)
	return createElement(
		View,
		{ style: { flex: 1 } },
		createElement(
			View,
			{ style: { flex: 1, marginBottom: reserved } },
			createElement(screen, props),
		),
		createElement(TabBar, { active }),
	)
}

// ---------------------------------------------------------------------------
// The bar

type TabSpec = {
	tab: Tab
	label: string
	glyph: ReactNode
	badge?: 'home' | 'notifications'
}

function TabBar({ active, fallback }: { active: Tab; fallback?: ReactNode }) {
	const styles = useStyles()
	const insets = ReactNativeSafeAreaContext?.useSafeAreaInsets?.()
	// Always called, so the hook order is stable even if a module is missing.
	const settings = useSettings()

	const home = icon('home')
	const bell = icon('bell')
	const gear = icon('settings')
	if (!home || !bell || !gear) return (fallback ?? null) as never

	const colors = tokenColors()
	const tint = (tab: Tab) =>
		active === tab
			? colors.INTERACTIVE_ICON_ACTIVE
			: colors.INTERACTIVE_ICON_DEFAULT

	const Avatar = avatarComponent()
	const user = currentUser()
	const userIcon = icon('user')
	let you: ReactNode = null
	if (Avatar && user)
		you = createElement(Avatar, { user, size: TAB_AVATAR_SIZE })
	else if (userIcon)
		you = createElement(userIcon, { size: 'md', color: tint('profile') })

	const tabs: TabSpec[] = [
		{
			tab: 'home',
			label: 'Home',
			glyph: createElement(home, { size: 'md', color: tint('home') }),
			badge: 'home',
		},
		{
			tab: 'notifications',
			label: 'Notifications',
			glyph: createElement(bell, { size: 'md', color: tint('notifications') }),
			badge: 'notifications',
		},
		{ tab: 'profile', label: 'You', glyph: you },
		{
			tab: 'settings',
			label: 'Settings',
			glyph: createElement(gear, { size: 'md', color: tint('settings') }),
		},
	]

	return createElement(
		View,
		{ style: [styles.bar, { paddingBottom: insets?.bottom ?? 0 }] },
		...tabs
			.filter(spec => spec.tab === 'home' || settings.tabs[spec.tab])
			.map(spec =>
				tabButton(styles, spec, active === spec.tab, settings.showLabels),
			),
	)
}

function tabButton(
	styles: Styles,
	spec: TabSpec,
	selected: boolean,
	showLabel: boolean,
) {
	let marker: ReactNode = null
	if (spec.badge === 'notifications')
		marker = createElement(NotificationsBadge, { styles })
	else if (spec.badge === 'home')
		marker = createElement(MentionsBadge, { styles })

	return createElement(
		Pressable,
		{
			key: spec.tab,
			style: styles.tab,
			onPress: () => switchTab(spec.tab),
			accessibilityRole: 'tab',
			accessibilityLabel: spec.label,
			accessibilityState: { selected },
		},
		createElement(View, { style: styles.iconBox }, spec.glyph, marker),
		showLabel
			? createElement(
					Design.Text,
					{
						variant: 'text-xxs/medium',
						color: selected
							? 'interactive-text-active'
							: 'interactive-text-default',
					} as never,
					spec.label,
				)
			: null,
	)
}

// Discord's badge hook lives in its own component, so whatever hooks it runs
// inside can never shift the hook order of the bar.
function NotificationsBadge({ styles }: { styles: Styles }) {
	const badge: Badge = (useBadge ??= found.badge ?? (() => ({})))()
	return badgeView(styles, badge?.value ?? 0, badge?.showDot)
}

// Home: mentions across servers and DMs, like the old home tab and the red
// counts on the server rail. GuildReadStateStore.getTotalMentionCount() sums
// every guild plus the DM bucket (passing `true` would leave DMs out).
type MentionStore = {
	getTotalMentionCount?: (excludePrivate?: boolean) => number
	addChangeListener?: (listener: () => void) => void
	removeChangeListener?: (listener: () => void) => void
}

function readMentions() {
	const store = (Stores as Record<string, MentionStore>).GuildReadStateStore
	return store?.getTotalMentionCount?.() ?? 0
}

function MentionsBadge({ styles }: { styles: Styles }) {
	const [count, setCount] = useState(readMentions)
	useEffect(() => {
		const store = (Stores as Record<string, MentionStore>).GuildReadStateStore
		const update = () => setCount(readMentions())
		update()
		store?.addChangeListener?.(update)
		return () => store?.removeChangeListener?.(update)
	}, [])
	return badgeView(styles, count)
}

function badgeView(styles: Styles, count: number, showDot?: boolean) {
	if (count > 0)
		return createElement(
			View,
			{ style: styles.badge },
			createElement(
				Design.Text,
				{ variant: 'text-xxs/bold', color: 'white' } as never,
				count > 99 ? '99+' : String(count),
			),
		)
	if (showDot) return createElement(View, { style: styles.dot })
	return null
}

// Fixed on first use so the hook a mounted badge calls never changes.
let useBadge: (() => Badge) | undefined

// Plain state + subscribe, so the hooks here are the same on every render
// whether or not the storage has finished loading. Missing keys (older
// storage files) fall back to the defaults.
function readSettings(): Settings {
	const cache = (found.storage?.cache ?? {}) as Partial<Settings>
	return {
		showLabels: cache.showLabels ?? DEFAULT_SETTINGS.showLabels,
		tabs: { ...DEFAULT_SETTINGS.tabs, ...cache.tabs },
	}
}

function tabEnabled(tab: Toggleable) {
	return readSettings().tabs[tab]
}

function useSettings() {
	const [settings, setSettings] = useState(readSettings)
	useEffect(() => {
		setSettings(readSettings())
		return found.storage?.subscribe(() => setSettings(readSettings()))
	}, [])
	return settings
}

// ---------------------------------------------------------------------------
// Navigation
//
// Back from any tab lands on Home, as it did with the old tabs, so a switch
// leaves at most one tab screen open over the home layout (root: main, tabs:
// guilds). The order matters with the fade: whatever is under the incoming
// screen shows through while it fades, so the visible change goes last and
// screens that are covered are cleaned up only after the fade ends.
// Otherwise Home flashes between two tabs.
//
// Plain action objects with a `target` key reach a nested stack without
// going through the screens in between.

const ROOT_SCREEN: Partial<Record<Tab, string>> = {
	profile: 'you',
	settings: 'settings',
}

// Longer than the native fade (about 350 ms on Android).
const CLEANUP_DELAY = 500

let cleanupTimer: ReturnType<typeof setTimeout> | undefined

function rootRef() {
	const ref = found.root?.()
	if (!ref || ref.isReady?.() === false) return
	return ref
}

function findTabs(state: NavState | undefined): NavState | undefined {
	const main = state?.routes.find(r => r.name === 'main')?.state
	return main?.routes.find(r => r.name === 'tabs')?.state
}

function currentTab(ref: RootRef): Tab {
	const state = ref.getRootState()
	const top = state.routes[state.index]?.name
	if (top === 'you') return 'profile'
	if (top === 'settings') return 'settings'
	const tabs = findTabs(state)
	if (tabs?.routes[tabs.index]?.name === 'notifications') return 'notifications'
	return 'home'
}

function popTabsToHome(ref: RootRef) {
	const tabs = findTabs(ref.getRootState())
	if (tabs && tabs.index > 0)
		ref.dispatch({ type: 'POP_TO_TOP', target: tabs.key })
}

function openNotificationsInTabs(ref: RootRef) {
	const tabs = findTabs(ref.getRootState())
	if (!tabs || tabs.routes[tabs.index]?.name === 'notifications') return
	if (tabs.index > 0) ref.dispatch({ type: 'POP_TO_TOP', target: tabs.key })
	ref.dispatch({
		type: 'NAVIGATE',
		payload: { name: 'notifications', params: { inNestedNavigator: true } },
		target: tabs.key,
	})
}

// After a root tab (You, Settings) has faded in: drop the other root screen
// and Notifications, both hidden under it now.
function scheduleCleanup(screen: string) {
	if (cleanupTimer) clearTimeout(cleanupTimer)
	cleanupTimer = setTimeout(() => {
		cleanupTimer = undefined
		const ref = rootRef()
		if (!ref) return
		const root = ref.getRootState()
		if (root.routes[root.index]?.name !== screen) return
		const routes = root.routes.filter(
			(_route, index) => index === 0 || index === root.index,
		)
		if (routes.length !== root.routes.length) {
			ref.dispatch({
				type: 'RESET',
				payload: { ...root, routes, index: routes.length - 1 },
				target: root.key,
			})
		}
		popTabsToHome(ref)
	}, CLEANUP_DELAY)
}

function switchTab(target: Tab) {
	const ref = rootRef()
	if (!ref || currentTab(ref) === target) return
	if (cleanupTimer) {
		clearTimeout(cleanupTimer)
		cleanupTimer = undefined
	}
	const root = ref.getRootState()
	const onRootScreen = root.index > 0

	const screen = ROOT_SCREEN[target]
	if (screen) {
		// Fade the new screen in over whatever is showing, tidy up later.
		ref.navigate(screen)
		scheduleCleanup(screen)
		return
	}

	// Home or Notifications live in the tabs stack. Set it up while it is
	// still covered, then uncover it.
	if (target === 'notifications') openNotificationsInTabs(ref)
	else popTabsToHome(ref)
	if (onRootScreen) ref.dispatch({ type: 'POP_TO_TOP', target: root.key })
}
