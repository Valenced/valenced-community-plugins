import { getModules } from '@valenced/modules/finders'
import { createFilterGenerator } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { createChatUi } from './ChatUi'
import { registerGuildbar } from './Guildbar'
import SettingsComponent, { defaults } from './Settings'
import { registerYouBar } from './YouBar'
import type { NamedExoticComponent } from 'react'
import type { HostProps, HostTree } from './ChatUi'
import type { Settings } from './Settings'

interface MemoComponent extends NamedExoticComponent<HostProps> {
	type: ((props: HostProps) => HostTree | null) & { displayName?: string }
}

function isMemo(value: unknown): value is MemoComponent {
	return (
		value !== null &&
		typeof value === 'object' &&
		'type' in value &&
		typeof value.type === 'function'
	)
}

const withMemoName = createFilterGenerator(
	([name]: [string], _id, value): value is MemoComponent =>
		isMemo(value) && (value.type.displayName ?? value.type.name) === name,
	([name]) => `collapsibleUI.memo:${name}`,
)

let ui: ReturnType<typeof createChatUi> | undefined
export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: { load: true, default: defaults },
	SettingsComponent,
	preInit({ cleanup, plugin }) {
		if (plugin.startedLate) {
			plugin.requireReload()
			return
		}
		// Subscribe before Discord captures the native Chat export in its imports.
		for (const name of ['StandaloneChannelScreen', 'ChatInput'] as const) {
			cleanup(
				getModules(withMemoName(name), component => {
					cleanup(
						instead(component, 'type', function (args, original) {
							const tree = original.apply(this, args)
							return (
								tree &&
								(name === 'ChatInput'
									? (ui?.ChatInput(tree, args[0].ref) ?? tree)
									: (ui?.StandaloneChannelScreen(tree) ?? tree))
							)
						}),
					)
				}),
			)
		}

		cleanup(() => {
			ui = undefined
		})
	},
	start(api) {
		if (api.plugin.startedLate) {
			api.plugin.requireReload()
			return
		}
		ui = createChatUi(api)
		registerYouBar(api, registerGuildbar(api))
	},
	stop({ plugin }) {
		plugin.requireReload()
	},
})
