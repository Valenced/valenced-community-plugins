import { DEFAULTS } from '../defaults'
import {
	getSettingsSnapshot,
	setSettings,
	subscribeSettings,
} from '../lib/settings'
import {
	close,
	closeAll,
	list,
	pop,
	show as showEngine,
	update,
} from './engine'
import { subscribeEntries } from './store'
import type { ToastApiSettings, ToastEntry, ToastInput } from '../types'

export interface ToastApi {
	/** Show a toast and return its id. Duplicate keys return the existing id. */
	show(input: ToastInput | string): string
	/** Update a visible toast. Its timer changes only when `duration` is patched. */
	update(id: string, patch: Partial<ToastInput>): boolean
	/** Close one toast by id. With no id, closes everything. */
	close(id?: string): void
	closeAll(): void
	/** Close the newest toast. */
	pop(): void
	list(): ToastEntry[]
	subscribe(cb: () => void): () => void
	/** Shared settings for this toast API. */
	settings: {
		get(): ToastApiSettings
		set(patch: Partial<ToastApiSettings>): void
		reset(): void
		subscribe(cb: () => void): () => void
	}
}

export const toasts: ToastApi = {
	show: showEngine,
	update,
	close,
	closeAll,
	pop,
	list,
	subscribe: subscribeEntries,
	settings: {
		get: getSettingsSnapshot,
		set: setSettings,
		reset: () => setSettings(DEFAULTS),
		subscribe: subscribeSettings,
	},
}
