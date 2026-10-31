import { onImportedPath, safeInstead } from '../modules'
import { getSettings } from '../state'
import type { PluginCleanupApi } from '@valenced/plugins/types'

export function patchServerThemes(cleanup: PluginCleanupApi): void {
	cleanup(
		onImportedPath(
			'modules/premium/powerups/experiments/ServerThemeUserExperiment.tsx',
			(
				ns: Record<
					'getServerThemeUserEnabled' | 'useServerThemeUserEnabled',
					(...args: unknown[]) => boolean
				>,
			) => {
				for (const key of [
					'getServerThemeUserEnabled',
					'useServerThemeUserEnabled',
				] as const)
					cleanup(
						safeInstead(ns, key, function (this: unknown, args, original) {
							const enabled = Reflect.apply(original, this, args)
							return getSettings().serverThemes ? false : enabled
						}),
					)
			},
		),
	)
}
