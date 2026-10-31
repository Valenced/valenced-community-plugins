import { onImportedPath, safeInstead } from '../modules'
import { getSettings } from '../state'
import type { PluginCleanupApi } from '@valenced/plugins/types'

export function patchBoostGoal(cleanup: PluginCleanupApi): void {
	const enabled = () => getSettings().boostGoal

	// Patch useGuildActionRows to filter out GUILD_PREMIUM_PROGRESS_BAR
	cleanup(
		onImportedPath<any>('modules/guild_sidebar/useGuildActionRows.tsx', ns => {
			const hook = ns?.default
			if (typeof hook !== 'function') return
			cleanup(
				safeInstead(ns, 'default', (args, original) => {
					const result = original(...args)
					if (!enabled() || !Array.isArray(result)) return result
					return result.filter(
						(row: any) => row !== 'guild-premium-progress-bar',
					)
				}),
			)
		}),
	)
}
