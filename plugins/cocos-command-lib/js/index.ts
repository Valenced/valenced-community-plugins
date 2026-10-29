import * as commands from './commands'
import { patchCommands } from './commands'
import * as modules from './modules'
import * as types from './types'
import Settings from './ui/Settings'

const commandLib = {
	types,
	modules,
	commands,
}

export default plugin({
	start({ decorate }) {
		patchCommands()

		decorate(plugin => {
			plugin.api.unscoped.commandlib = commandLib
		})
	},
	SettingsComponent: Settings,
})

export type CommandLibApi = typeof commandLib

declare module '@valenced/plugins/types' {
	interface UnscopedPluginApi {
		commandlib: CommandLibApi
	}
}
