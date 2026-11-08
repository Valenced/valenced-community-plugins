import { registerMessageSheet } from './customization/MessageSheet'
import { registerSettingsEditor } from './customization/SettingsEditor'
import { DEFAULTS } from './defaults'
import { initModules } from './lib/modules'
import { patchAll } from './lib/patches'
import { setStorage } from './lib/state'
import Settings from './settings'
import type { DeclutterSettings } from './types'

export { DEFAULTS }
export type { DeclutterSettings }

export default plugin<{ jsonStorage: DeclutterSettings }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},
	start(api) {
		const { cleanup, jsonStorage, plugin } = api
		if (plugin.startedLate) {
			plugin.requireReload()
			return
		}
		registerMessageSheet(api)
		registerSettingsEditor(api)
		initModules(error => plugin.reportError(error))
		setStorage(jsonStorage, plugin.api.unscoped)

		try {
			patchAll(cleanup)
		} catch (error) {
			plugin.reportError(error)
		}
	},
	// The same caching that delays the enabled state also delays the disabled state: hidden
	// clutter (avatar decorations, nameplates, ...) stays parsed on already-cached records,
	// so disabling or uninstalling the plugin only fully applies after a reload.
	stop() {
		this.requireReload()
	},
	SettingsComponent: Settings,
})
