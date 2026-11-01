import {
	resolveHaptics,
	resolveHttp,
	resolveRoleIcon,
	resolveRoleSort,
	resolveUserUi,
} from './lib/client'
import { initPermissions } from './lib/permissions'
import { resolveRoleItem } from './lib/roleItem'
import { resolveRoleMembersSheet } from './lib/roleMembers'
import { registerRoutes } from './lib/routes'
import { resolveUserActions } from './lib/stores'
import patchActionSheets from './patches/sheets'
import patchUserProfileMenu from './patches/userProfile'
import type { PluginApi } from '@valenced/plugins/types'

/** The lifecycle api, so modules outside `start` can report errors. */
export let api: PluginApi | undefined

export default plugin({
	start({ cleanup, plugin }) {
		if (plugin.startedLate) {
			plugin.requireReload()
			return
		}

		api = plugin.api
		cleanup(() => {
			api = undefined
		})

		// Rows read this map, so a missing client map stops the plugin here.
		try {
			initPermissions()
		} catch (error) {
			plugin.reportError(error)
			plugin.disable()
			return
		}

		for (const install of [
			() => resolveRoleItem(cleanup),
			() => resolveRoleSort(cleanup),
			() => resolveHttp(cleanup),
			() => resolveUserActions(cleanup),
			() => resolveRoleMembersSheet(),
			() => resolveUserUi(cleanup),
			() => resolveRoleIcon(cleanup),
			() => resolveHaptics(cleanup),
			() => registerRoutes(cleanup),
			() => patchActionSheets(cleanup),
			() => patchUserProfileMenu(cleanup),
		]) {
			try {
				install()
			} catch (error) {
				plugin.reportError(error)
			}
		}
	},
	stop({ plugin }) {
		// Patched UI is memoized by the client; reload so nothing lingers.
		plugin.requireReload()
	},
})
