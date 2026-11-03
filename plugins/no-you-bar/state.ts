import { useEffect, useState } from 'react'

// Plugin-wide state: the settings shape, the modules found at start, and the
// hooks that read them. Everything else imports from here, never the reverse.

export type Logger = { log: (...args: unknown[]) => void }
export type Props = Record<string, unknown>
export type Badge = { value?: number; showDot?: boolean }

export type Tab = 'home' | 'notifications' | 'profile' | 'settings'
// Home is always on: it is the only way back to DMs and servers.
export type Toggleable = Exclude<Tab, 'home'>

export type Settings = {
	showLabels: boolean
	fullScreenSettings: boolean
	tabs: Record<Toggleable, boolean>
}

export const DEFAULT_SETTINGS: Settings = {
	showLabels: true,
	// The Settings screen opens full screen, without the bar, and keeps
	// Discord's close button as the way back out.
	fullScreenSettings: true,
	tabs: { notifications: true, profile: true, settings: true },
}

export type Storage = {
	cache?: unknown
	subscribe: (callback: () => void) => () => void
	set: (value: Partial<Settings>) => unknown
}

export type NavRoute = {
	name: string
	key: string
	params?: unknown
	state?: NavState
}
export type NavState = { key: string; index: number; routes: NavRoute[] }
export type RootRef = {
	isReady?: () => boolean
	getRootState: () => NavState
	dispatch: (action: unknown) => void
	navigate: (name: string, params?: unknown) => void
}

// Filled in by start(), emptied again on cleanup.
export const found: {
	root?: () => RootRef | undefined
	badge?: () => Badge
	storage?: Storage
} = {}

// Discord's modules can finish loading after the bar has already rendered.
// start() calls foundModulesChanged() when one of the modules above arrives;
// a bar that already rendered without it re-renders and picks it up. Without
// this, a bar that rendered before useNotificationsTabBadge loaded would keep
// its no-op badge forever.
const moduleListeners = new Set<() => void>()

export function foundModulesChanged() {
	for (const listener of moduleListeners) listener()
}

export function useFoundModules() {
	const [, bump] = useState(0)
	useEffect(() => {
		const listener = () => bump(n => n + 1)
		moduleListeners.add(listener)
		// A module may have arrived between this render and the subscription.
		listener()
		return () => {
			moduleListeners.delete(listener)
		}
	}, [])
}

// Plain state + subscribe, so the hooks here are the same on every render
// whether or not the storage has finished loading. Missing keys (older
// storage files) fall back to the defaults.
export function readSettings(): Settings {
	const cache = (found.storage?.cache ?? {}) as Partial<Settings>
	return {
		showLabels: cache.showLabels ?? DEFAULT_SETTINGS.showLabels,
		fullScreenSettings:
			cache.fullScreenSettings ?? DEFAULT_SETTINGS.fullScreenSettings,
		tabs: { ...DEFAULT_SETTINGS.tabs, ...cache.tabs },
	}
}

export function tabEnabled(tab: Toggleable) {
	return readSettings().tabs[tab]
}

export function fullScreenSettings() {
	return readSettings().fullScreenSettings
}

export function useSettings() {
	const [settings, setSettings] = useState(readSettings)
	useEffect(() => {
		setSettings(readSettings())
		return found.storage?.subscribe(() => setSettings(readSettings()))
	}, [])
	return settings
}
