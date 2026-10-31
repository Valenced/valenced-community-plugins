import { DEFAULTS } from '../defaults'
import type { JsonStorage } from '@valenced/json-storage'
import type { DeclutterSettings } from '../types'

type ValencedJsonStorageApi<S extends object> = JsonStorage<S>

const SERVER_DRAWER_PLUGIN_ID = 'dev.kmmiio99o.server-drawer'

// Optional compatibility with the original Server Drawer registry.
let compatibility:
	| { kmmiio?: { isPluginRunning(id: string): boolean } }
	| undefined

let storage: ValencedJsonStorageApi<DeclutterSettings> | undefined

export function setStorage(
	handle: ValencedJsonStorageApi<DeclutterSettings>,
	api: object,
) {
	compatibility = api
	storage = handle
}

export function getStorage() {
	return storage
}

export function isServerDrawerRunning(): boolean {
	try {
		return (
			compatibility?.kmmiio?.isPluginRunning(SERVER_DRAWER_PLUGIN_ID) === true
		)
	} catch {
		return false
	}
}

export function getSettings(): DeclutterSettings {
	const settings = { ...DEFAULTS, ...(storage?.cache ?? {}) }
	if (isServerDrawerRunning()) {
		settings.questDock = false
	}
	return settings
}

export function setSettings(patch: Partial<DeclutterSettings>): void {
	storage?.set({ ...getSettings(), ...patch })
}
