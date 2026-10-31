import { DEFAULTS } from '../defaults'
import { reportError } from './errors'
import type { JsonStorage } from '@valenced/json-storage'
import type { ToastApiSettings } from '../types'

let storage: JsonStorage<ToastApiSettings> | undefined
let snapshot: ToastApiSettings = { ...DEFAULTS }
// Keep reads current while the storage cache catches up.
let lastWrite: ToastApiSettings | undefined
const listeners = new Set<() => void>()

export function setStorage(handle: JsonStorage<ToastApiSettings>) {
	storage = handle
	lastWrite = undefined
	snapshot = getSettings()
}

export function getSettings(): ToastApiSettings {
	return { ...DEFAULTS, ...(storage?.cache ?? {}), ...(lastWrite ?? {}) }
}

export function setSettings(patch: Partial<ToastApiSettings>): void {
	const next = { ...getSettings(), ...patch }
	lastWrite = next
	snapshot = next
	emit()
	storage?.set(next)
	// Refresh the snapshot after the storage cache updates.
	setTimeout(notifySettings, 0)
}

/** Cached snapshot used by React subscribers. */
export function getSettingsSnapshot(): ToastApiSettings {
	return snapshot
}

export function subscribeSettings(cb: () => void): () => void {
	listeners.add(cb)
	return () => {
		listeners.delete(cb)
	}
}

export function notifySettings(): void {
	snapshot = getSettings()
	emit()
}

function emit(): void {
	for (const cb of [...listeners]) {
		try {
			cb()
		} catch (error) {
			reportError(error)
		}
	}
}
