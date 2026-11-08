import {
	getDefaultNameFilter,
	onModule,
	resolveComponent,
	safeInstead,
	safeInsteadJSX,
} from '../modules'
import { getSettings } from '../state'
import type { PluginCleanupApi } from '@valenced/plugins/types'

export function patchProfileEffects(cleanup: PluginCleanupApi): void {
	const enabled = () => getSettings().profileEffects

	cleanup(
		onModule(getDefaultNameFilter('useProfileEffect'), ns => {
			cleanup(
				safeInstead(ns, 'default', (args, original) => {
					const effect = original(...args)
					return enabled() ? null : effect
				}),
			)
		}),
	)

	cleanup(
		onModule(getDefaultNameFilter('WrappedProfileEffect'), ns => {
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
