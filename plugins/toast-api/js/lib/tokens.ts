import { Tokens } from '@valenced/discord/common/tokens'
import { Stores } from '@valenced/discord/flux'
import { ReactNative } from '@valenced/react'
import type { DiscordModules } from '@valenced/discord/types'

type ThemeStore = DiscordModules.Flux.Store<{ theme: string }>

/** Resolve a Discord color token or pass through a hex color. */
export function resolveColor(semToken?: string): string | undefined {
	if (!semToken) return undefined
	if (semToken.startsWith('#')) return semToken
	const { colors, internal } = Tokens.default
	const token =
		colors[semToken as keyof typeof colors] ??
		colors[semToken.replaceAll('-', '_').toUpperCase() as keyof typeof colors]
	if (!token) return undefined
	const theme = (Stores.ThemeStore as ThemeStore).theme
	return internal.resolveSemanticColor(theme, token)
}

const SHADOW_KEYS = [
	'shadowOffset',
	'shadowColor',
	'shadowOpacity',
	'shadowRadius',
	'elevation',
] as const

/** Resolve Discord's high shadow for the current theme and platform. */
export function resolveShadowStyles(): Record<string, any> | undefined {
	const shadow = Tokens.default.shadows?.SHADOW_HIGH
	if (shadow == null) return undefined
	const ctx = {
		theme: (Stores.ThemeStore as ThemeStore).theme,
		isAndroid: ReactNative.Platform.OS === 'android',
	}
	const out: Record<string, any> = {}
	for (const key of SHADOW_KEYS) {
		const slot = shadow[key]
		if (slot == null) continue
		out[key] = typeof slot?.resolve === 'function' ? slot.resolve(ctx) : slot
	}
	return out
}
