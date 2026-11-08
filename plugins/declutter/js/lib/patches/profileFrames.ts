import {
	getDefaultNameFilter,
	getProfileFrameComponentFilter,
	onModule,
	resolveComponent,
	safeInstead,
	safeInsteadJSX,
} from '../modules'
import { getSettings } from '../state'
import type { PluginCleanupApi } from '@valenced/plugins/types'

export function patchProfileFrames(cleanup: PluginCleanupApi): void {
	const enabled = () => getSettings().profileFrames

	cleanup(
		onModule(getDefaultNameFilter('useProfileFrame'), ns => {
			cleanup(
				safeInstead(ns, 'default', (args, original) => {
					const frame = original(...args)
					return enabled() ? null : frame
				}),
			)
		}),
	)

	cleanup(
		onModule(getProfileFrameComponentFilter(), ns => {
			const component = resolveComponent(ns)
			if (!component) return
			cleanup(
				safeInsteadJSX(component, (args, jsx) => {
					if (!enabled()) return jsx(...args)
					return null
				}),
			)
		}),
	)
}
