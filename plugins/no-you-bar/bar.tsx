import { Tokens } from '@valenced/discord/common/tokens'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { lookupModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { ReactNativeSafeAreaContext } from '@valenced/externals/react-native-safe-area-context'
import { useEffect, useState } from 'react'
import { Pressable, View } from 'react-native'
import { switchTab } from './navigation'
import { found, useSettings } from './state'
import type { ComponentType, ReactNode } from 'react'
import type { Badge, Props, Tab } from './state'

// The bar itself: icons, styles, badges, and the TabBar component.

const ICONS = 'design/components/Icon/native/redesign/generated/'
const AVATAR = 'design/void/Avatar/native/Avatar.tsx'

export const BAR_HEIGHT = 56
// AvatarSizes.TABS_22: the size Discord kept for the old You tab.
const TAB_AVATAR_SIZE = 'tabs22'

type Icon = ComponentType<{ size?: string; color?: unknown }>

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

// Themes may give the background token an alpha channel so a wallpaper shows
// through. Content scrolls under the docked bar, so the bar itself must not
// be see-through: the alpha is stripped and the theme's color kept.
function opaque(color: unknown): unknown {
	if (typeof color !== 'string') return color
	const hex8 = /^#([0-9a-f]{6})[0-9a-f]{2}$/i.exec(color)
	if (hex8) return `#${hex8[1]}`
	const hex4 = /^#([0-9a-f]{3})[0-9a-f]$/i.exec(color)
	if (hex4) return `#${hex4[1]}`
	const fn = /^(rgb|hsl)a\((.+),[^,]*\)$/i.exec(color)
	if (fn) return `${fn[1]}(${fn[2]})`
	return color
}

const sheet = (colors = tokenColors()) => ({
	bar: {
		position: 'absolute',
		left: 0,
		right: 0,
		bottom: 0,
		flexDirection: 'row',
		backgroundColor: opaque(colors.BACKGROUND_BASE_LOWER),
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

type TabSpec = {
	tab: Tab
	label: string
	glyph: ReactNode
	badge?: 'home' | 'notifications'
}

export function TabBar({
	active,
	fallback,
}: {
	active: Tab
	fallback?: ReactNode
}) {
	const styles = useStyles()
	const insets = ReactNativeSafeAreaContext?.useSafeAreaInsets?.()
	// Always called, so the hook order is stable even if a module is missing.
	const settings = useSettings()

	const Home = icon('home')
	const Bell = icon('bell')
	const Gear = icon('settings')
	if (!Home || !Bell || !Gear) return (fallback ?? null) as never

	const colors = tokenColors()
	const tint = (tab: Tab) =>
		active === tab
			? colors.INTERACTIVE_ICON_ACTIVE
			: colors.INTERACTIVE_ICON_DEFAULT

	const Avatar = avatarComponent()
	const user = currentUser()
	const UserIcon = icon('user')
	let you: ReactNode = null
	if (Avatar && user) you = <Avatar user={user} size={TAB_AVATAR_SIZE} />
	else if (UserIcon) you = <UserIcon size="md" color={tint('profile')} />

	const tabs: TabSpec[] = [
		{
			tab: 'home',
			label: 'Home',
			glyph: <Home size="md" color={tint('home')} />,
			badge: 'home',
		},
		{
			tab: 'notifications',
			label: 'Notifications',
			glyph: <Bell size="md" color={tint('notifications')} />,
			badge: 'notifications',
		},
		{ tab: 'profile', label: 'You', glyph: you },
		{
			tab: 'settings',
			label: 'Settings',
			glyph: <Gear size="md" color={tint('settings')} />,
		},
	]

	return (
		<View style={[styles.bar, { paddingBottom: insets?.bottom ?? 0 }]}>
			{tabs
				.filter(spec => spec.tab === 'home' || settings.tabs[spec.tab])
				.map(spec => (
					<TabButton
						key={spec.tab}
						styles={styles}
						spec={spec}
						selected={active === spec.tab}
						showLabel={settings.showLabels}
					/>
				))}
		</View>
	)
}

function TabButton({
	styles,
	spec,
	selected,
	showLabel,
}: {
	styles: Styles
	spec: TabSpec
	selected: boolean
	showLabel: boolean
}) {
	let marker: ReactNode = null
	if (spec.badge === 'notifications')
		marker = <NotificationsBadge styles={styles} />
	else if (spec.badge === 'home') marker = <MentionsBadge styles={styles} />

	return (
		<Pressable
			style={styles.tab}
			onPress={() => switchTab(spec.tab)}
			accessibilityRole="tab"
			accessibilityLabel={spec.label}
			accessibilityState={{ selected }}
		>
			<View style={styles.iconBox}>
				{spec.glyph}
				{marker}
			</View>
			{showLabel ? (
				<Design.Text
					variant="text-xxs/medium"
					color={
						selected ? 'interactive-text-active' : 'interactive-text-default'
					}
				>
					{spec.label}
				</Design.Text>
			) : null}
		</Pressable>
	)
}

// Fixed on first use so the hook a mounted badge calls never changes.
let useBadge: (() => Badge) | undefined

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
		return (
			<View style={styles.badge}>
				<Design.Text variant="text-xxs/bold" color="white">
					{count > 99 ? '99+' : String(count)}
				</Design.Text>
			</View>
		)
	if (showDot) return <View style={styles.dot} />
	return null
}
