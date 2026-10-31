import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { toasts } from '../api/api'
import { reportError } from './errors'
import { getSettings } from './settings'
import type { ToastInput, ToastVariant } from '../types'

/** Variants accepted by Discord's Mana toast API. */
const VARIANT_NAMES = ['default', 'success', 'critical', 'warning', 'info']

// Keep forwarded ids in display order; Discord closes the oldest toast first.
const forwarded: string[] = []

const wrapped = new WeakSet<object>()

function liveIds(): Set<string> {
	return new Set(toasts.list().map(entry => entry.id))
}

function pruneForwarded(live: Set<string>): void {
	for (let i = forwarded.length - 1; i >= 0; i--) {
		if (!live.has(forwarded[i])) forwarded.splice(i, 1)
	}
}

/** Show a Discord toast through this API and track its id. */
function showForwarded(input: ToastInput): void {
	pruneForwarded(liveIds())
	forwarded.push(toasts.show(input))
}

/** Return the oldest forwarded toast that is still visible. */
function takeOldestForwarded(): string | undefined {
	pruneForwarded(liveIds())
	return forwarded.shift()
}

/** Convert `ToastActionCreators.open()` options to a toast input. */
function fromOpen(options: any): ToastInput {
	const icon = options?.icon
	const input: ToastInput = {
		content: typeof options?.content === 'string' ? options.content : '',
	}
	if (typeof options?.key === 'string' && options.key.length > 0) {
		input.key = options.key
	}
	const component =
		typeof options?.IconComponent === 'function'
			? options.IconComponent
			: typeof icon === 'function'
				? icon
				: undefined
	if (component != null) input.IconComponent = component
	else if (typeof icon === 'number') input.icon = icon
	if (typeof options?.iconColor === 'string') {
		input.iconColor = options.iconColor
		// Preserve Discord's icon tint for numeric assets.
		if (typeof icon === 'number') input.recolorLegacyIcon = true
	}
	if (options?.containerStyle != null)
		input.containerStyle = options.containerStyle
	return input
}

/** Convert `openMana()` arguments to a toast input. */
function fromOpenMana(key: any, payload: any): ToastInput {
	const input: ToastInput = {
		content: typeof payload?.text === 'string' ? payload.text : '',
	}
	if (typeof key === 'string' && key.length > 0) input.key = key
	const variant = payload?.variant
	if (typeof variant === 'string' && VARIANT_NAMES.includes(variant)) {
		input.variant = variant as ToastVariant
	}
	const icon = payload?.icon
	if (typeof icon === 'function') input.IconComponent = icon
	else if (typeof icon === 'number') input.icon = icon
	else if (
		icon != null &&
		typeof icon === 'object' &&
		typeof icon.type === 'string'
	)
		input.iconEntity = icon
	if (typeof payload?.iconColor === 'string')
		input.iconColor = payload.iconColor
	return input
}

/** Wrap Discord's toast actions. Return false if the export is not ready. */
function wrap(target: any, restorers: Array<() => void>): boolean {
	if (target == null || typeof target !== 'object') return false
	if (wrapped.has(target)) return true
	if (typeof target.open !== 'function' || typeof target.close !== 'function')
		return false

	const originalOpen = target.open
	const originalClose = target.close
	const originalOpenMana =
		typeof target.openMana === 'function' ? target.openMana : undefined

	try {
		target.open = (...args: any[]) => {
			if (getSettings().overrideDiscordToasts !== true)
				return originalOpen.apply(target, args)
			try {
				showForwarded(fromOpen(args[0]))
				return undefined
			} catch (error) {
				reportError(error)
				return originalOpen.apply(target, args)
			}
		}

		target.close = (...args: any[]) => {
			if (getSettings().overrideDiscordToasts !== true)
				return originalClose.apply(target, args)
			try {
				const id = takeOldestForwarded()
				if (id !== undefined) {
					toasts.close(id)
					return undefined
				}
			} catch (error) {
				reportError(error)
			}
			// Nothing forwarded is visible; let Discord handle the close.
			return originalClose.apply(target, args)
		}

		if (originalOpenMana != null) {
			target.openMana = (...args: any[]) => {
				if (getSettings().overrideDiscordToasts !== true)
					return originalOpenMana.apply(target, args)
				try {
					showForwarded(fromOpenMana(args[0], args[1]))
					return undefined
				} catch (error) {
					reportError(error)
					return originalOpenMana.apply(target, args)
				}
			}
		}
	} catch (error) {
		reportError(error)
		return false
	}

	wrapped.add(target)
	restorers.push(() => {
		target.open = originalOpen
		target.close = originalClose
		if (originalOpenMana != null) target.openMana = originalOpenMana
		wrapped.delete(target)
	})
	return true
}

/** Install the wrappers when Discord's ToastActionCreators module loads. */
export function installToastOverride(): () => void {
	const restorers: Array<() => void> = []
	let stopped = false

	const attempt = (ns: any): void => {
		if (stopped) return
		wrap(ns?.default, restorers)
	}

	const unsubscribe = getModuleWithImportedPath(
		'modules/toast/native/ToastActionCreators.tsx',
		attempt,
	)

	return () => {
		stopped = true
		unsubscribe()
		for (const restore of restorers.splice(0)) {
			try {
				restore()
			} catch (error) {
				reportError(error)
			}
		}
		forwarded.length = 0
	}
}
