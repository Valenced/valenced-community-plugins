import { getDefaultNameFilter, onModule, safeInstead } from '../modules'
import { getSettings } from '../state'
import type { PluginCleanupApi } from '@valenced/plugins/types'

export function patchBadges(cleanup: PluginCleanupApi): void {
	const enabled = () => getSettings().badges

	cleanup(
		onModule(getDefaultNameFilter('useBadges'), ns => {
			cleanup(
				safeInstead(ns, 'default', (args, original) => {
					const badges = original(...args)
					return enabled() ? [] : badges
				}),
			)
		}),
	)
}
