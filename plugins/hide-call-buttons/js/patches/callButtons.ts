import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { after } from '@valenced/patcher'
import { pruneDM, pruneFriends, pruneProfile, pruneVoice } from '../lib/prune'
import { reportError } from '../lib/report'
import { DEFAULTS } from '../settings'
import type { JsonStorage } from '@valenced/json-storage'
import type { PluginCleanupApi } from '@valenced/plugins/types'
import type { ReactNode } from 'react'
import type { Prune } from '../lib/prune'
import type { HideCallButtonsStorage } from '../settings'

/**
 * Hides the call and camera controls this plugin knows about.
 *
 * One patch type throughout: `after` on the render React calls -- `.type` for the `React.memo`
 * wrappers, `.default` for the plain functions. Modules are found by Discord source path
 * (`getModuleWithImportedPath`): on 349.5 and later these components' function
 * names are minified, so `withName` has nothing stable to match.
 *
 * | Surface       | Source file                                                | Rule                                  |
 * | ------------- | ---------------------------------------------------------- | ------------------------------------- |
 * | User profile  | `user_profile/native/UserProfileContactButtons.tsx`        | drop the last action (the call)       |
 * | DM header     | `main_tabs_v2/.../channel/header/PrivateChannelButtons.tsx` | drop pressables carrying `disabled`   |
 * | Friends list  | `main_tabs_v2/.../user_list/UserRow.tsx`                   | drop the `call` action + its trailing |
 * | Voice channel | `voice_panel/.../buttons/VoicePanelVideoButton.tsx`        | render `null`                         |
 *
 * Rules locate a control by its position in its own row, never by icon or asset id, and no-op
 * when the shape is missing. Every change is a copy: Discord's compiler reuses rendered elements
 * across renders, so editing one in place would apply the change again on every render.
 */

/** A component's render function, as the patcher sees it. */
type Render = (...args: unknown[]) => ReactNode

/** Where a module keeps the render React calls: `default.type` for a memo, `default` otherwise. */
function renderTarget(
	ns: unknown,
): { host: Record<string, Render>; key: 'type' | 'default' } | undefined {
	const target = (ns as { default?: unknown } | undefined)?.default
	if (
		target !== null &&
		typeof target === 'object' &&
		typeof (target as { type?: unknown }).type === 'function'
	)
		return { host: target as Record<string, Render>, key: 'type' }
	if (typeof target === 'function')
		return { host: ns as Record<string, Render>, key: 'default' }
	return undefined
}

const SURFACES: Array<[path: string, label: string, prune: Prune]> = [
	[
		'modules/user_profile/native/UserProfileContactButtons.tsx',
		'profile',
		pruneProfile,
	],
	[
		'modules/main_tabs_v2/native/channel/header/PrivateChannelButtons.tsx',
		'dm header',
		pruneDM,
	],
	[
		'modules/main_tabs_v2/native/shared_components/user_list/UserRow.tsx',
		'friends row',
		pruneFriends,
	],
	[
		'modules/voice_panel/native/controls/buttons/VoicePanelVideoButton.tsx',
		'voice camera',
		pruneVoice,
	],
]

/** Hooks every surface. Each lookup and each patch is handed to [cleanup] as it is made. */
export default function patchCallButtons(
	cleanup: PluginCleanupApi,
	jsonStorage: JsonStorage<HideCallButtonsStorage>,
) {
	const settings = (): HideCallButtonsStorage => ({
		...DEFAULTS,
		...jsonStorage.cache,
	})

	for (const [path, label, prune] of SURFACES) {
		cleanup(
			getModuleWithImportedPath<unknown>(path, ns => {
				const target = renderTarget(ns)
				if (!target) return
				cleanup(
					after(target.host, target.key, rendered => {
						try {
							return prune(rendered, settings())
						} catch (error) {
							reportError(`[HideCallButtons] ${label}:`, error)
							return rendered
						}
					}),
				)
			}),
		)
	}
}
