import { toasts } from './api/api'
import { clearAll } from './api/engine'
import { DEFAULTS } from './defaults'
import { setErrorReporter } from './lib/errors'
import { installToastOverride } from './lib/override'
import { patchAll } from './lib/patches'
import { notifySettings, setStorage } from './lib/settings'
import type { ToastApi } from './api/api'
import type { ToastApiSettings, ToastEntry, ToastInput } from './types'

export { DEFAULTS }
export type { ToastApi, ToastApiSettings, ToastEntry, ToastInput }

export default plugin<{ jsonStorage: ToastApiSettings }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},
	start({ cleanup, jsonStorage, decorate, plugin }) {
		setStorage(jsonStorage)
		setErrorReporter(error => plugin.reportError(error))

		cleanup(
			jsonStorage.subscribe(() => {
				notifySettings()
			}),
		)

		decorate(plugin => {
			plugin.api.toasts = toasts
			plugin.api.unscoped.toasts = toasts
			return () => {
				Reflect.deleteProperty(plugin.api, 'toasts')
				Reflect.deleteProperty(plugin.api.unscoped, 'toasts')
			}
		})

		cleanup(patchAll())
		cleanup(installToastOverride())
	},
	stop() {
		clearAll()
		setErrorReporter(error => {
			throw error
		})
	},
})

declare module '@valenced/plugins/types' {
	interface PluginApi {
		toasts: ToastApi
	}
	interface UnscopedPluginApi {
		toasts: ToastApi
	}
}
