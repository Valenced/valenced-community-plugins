import { initStorage } from './lib/storage'
import { DEFAULT_STORAGE } from './lib/types'
import patchCompactYou, { syncConstants } from './patches/compactYou'
import patchHideBuiltinDm, {
	requestGuildsBarUpdate,
} from './patches/hideBuiltinDm'
import patchYouBarButtons, {
	requestYouBarUpdate,
} from './patches/youBarButtons'
import patchLocalFavorites from './patches/localFavorites'
import Settings from './ui/Settings'
import type { YouBarPlusStorage } from './lib/types'

export default plugin<{ jsonStorage: YouBarPlusStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULT_STORAGE,
	},

	start(api) {
		if (api.plugin?.startedLate) {
			try {
				api.plugin.requireReload()
			} catch {}
		}

		const cleanStorage = initStorage(api.jsonStorage)

		const everest =
			(api as any).unscoped?.everest ??
			(api as any).unscoped?.roselib ??
			(valenced as any)?.everest ??
			(valenced as any)?.roselib ??
			(globalThis as any)?.__everest ??
			(globalThis as any)?.__roselib
		everest?.setActivePlugin?.(api.plugin?.manifest?.id ?? 'rosie.you-bar-plus')
		everest?.registerPlugin?.({
			id: api.plugin?.manifest?.id ?? 'rosie.you-bar-plus',
			name: api.plugin?.manifest?.name ?? 'YouBar+',
			icon: api.plugin?.manifest?.icon ?? 'CompassIcon',
			author: api.plugin?.manifest?.author ?? 'Rosie',
			description: api.plugin?.manifest?.description ?? '',
			version: api.plugin?.manifest?.version,
			getStatus: () => api.plugin?.status,
			getErrors: () => api.plugin?.errors,
		})

		void api.jsonStorage.get().then(() => {
			syncConstants()
			requestYouBarUpdate()
			requestGuildsBarUpdate()
		})

		let unpatchButtons = () => {}
		try {
			unpatchButtons = patchYouBarButtons(api.jsonStorage)
		} catch (e) {
			api.logger?.error?.(`[YouBar+] Failed to apply buttons patch: ${e}`)
		}

		let unpatchCompact = () => {}
		try {
			unpatchCompact = patchCompactYou(api.jsonStorage)
		} catch (e) {
			api.logger?.error?.(`[YouBar+] Failed to apply compacting patch: ${e}`)
		}

		let unpatchBuiltinDm = () => {}
		try {
			unpatchBuiltinDm = patchHideBuiltinDm(api.jsonStorage)
		} catch (e) {
			api.logger?.error?.(`[YouBar+] Failed to apply hide builtin DM patch: ${e}`)
		}

		let unpatchFavorites = () => {}
		try {
			unpatchFavorites = patchLocalFavorites(api.jsonStorage, api.cleanup)
		} catch (e) {
			api.logger?.error?.(`[YouBar+] Failed to apply local favorites patch: ${e}`)
		}

		api.cleanup(() => {
			cleanStorage()
			unpatchButtons()
			unpatchCompact()
			unpatchBuiltinDm()
			unpatchFavorites()
		})
	},

	SettingsComponent: Settings,
})
