import {
	getDefaultNameFilter,
	getPropsFilter,
	onModule,
	resolveComponent,
	safeInstead,
	safeInsteadJSX,
} from '../modules'
import { getSettings } from '../state'
import type { PluginCleanupApi } from '@valenced/plugins/types'

export function patchNameplates(cleanup: PluginCleanupApi): void {
	const enabled = () => getSettings().nameplates

	cleanup(
		onModule(getPropsFilter('useNameplate'), ns => {
			cleanup(
				safeInstead(ns, 'useNameplate', (args, original) => {
					const nameplate = original(...args)
					return enabled() ? null : nameplate
				}),
			)
		}),
	)

	cleanup(
		onModule(getDefaultNameFilter('Nameplate'), ns => {
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
