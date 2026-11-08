import {
	onImportedPath,
	resolveComponent,
	safeInstead,
	safeInsteadJSX,
} from '../modules'
import { getSettings } from '../state'
import type { PluginCleanupApi } from '@valenced/plugins/types'

/*
 *   8189  modules/guild_tag/GuildTagUtils.tsx
 *   9170  modules/guild_tag/native/GuildTag.tsx
 *   15164 modules/guild_tag/native/VoiceGuildTag.tsx
 */
export function patchServerTags(cleanup: PluginCleanupApi): void {
	const enabled = () => getSettings().serverTags

	cleanup(
		onImportedPath<any>('modules/guild_tag/GuildTagUtils.tsx', ns => {
			cleanup(
				safeInstead(ns, 'useShouldDisplayGuildTag', (args, original) => {
					const shouldDisplay = original(...args)
					return enabled() ? false : shouldDisplay
				}),
			)
			cleanup(
				safeInstead(ns, 'shouldDisplayGuildTag', (args, original) => {
					if (!enabled()) return original(...args)
					return false
				}),
			)
			cleanup(
				safeInstead(ns, 'getUserPrimaryGuild', (args, original) => {
					const result = original(...args)
					if (!enabled() || !result) return result
					return { ...result, tag: null, badge: null, guildId: null }
				}),
			)
		}),
	)

	cleanup(
		onImportedPath<any>('modules/guild_tag/native/GuildTag.tsx', ns => {
			const components = [
				resolveComponent(ns),
				resolveComponent(ns.GuildTagBadge),
				resolveComponent(ns.BaseGuildTagChiplet),
			]
			for (const component of components) {
				if (!component) continue
				cleanup(
					safeInsteadJSX(component, (args, jsx) => {
						if (!enabled()) return jsx(...args)
						return null
					}),
				)
			}
		}),
	)

	cleanup(
		onImportedPath<any>('modules/guild_tag/native/VoiceGuildTag.tsx', ns => {
			const chiplet = resolveComponent(ns)
			if (!chiplet) return
			cleanup(
				safeInsteadJSX(chiplet, (args, jsx) => {
					if (!enabled()) return jsx(...args)
					return null
				}),
			)
		}),
	)
}
