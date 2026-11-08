import { getDefaultNameFilter, onModule, safeInstead } from '../modules'
import { getSettings } from '../state'
import type { PluginCleanupApi } from '@valenced/plugins/types'

export function patchDisplayNameStyles(cleanup: PluginCleanupApi): void {
	for (const name of ['useDisplayNameStyles', 'createMessageContent'])
		cleanup(
			onModule(
				getDefaultNameFilter(name),
				(ns: { default: (...args: unknown[]) => unknown }) => {
					cleanup(
						safeInstead(
							ns,
							'default',
							function (this: unknown, args, original) {
								const result = Reflect.apply(original, this, args)
								if (!getSettings().displayNameStyles) return result
								if (name === 'useDisplayNameStyles') return null
								return result &&
									typeof result === 'object' &&
									'displayNameStyles' in result &&
									result.displayNameStyles != null
									? { ...result, displayNameStyles: null }
									: result
							},
						),
					)
				},
			),
		)
}
