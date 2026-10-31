import * as commands from './commands'
import { patchCommands, unpatchCommands } from './commands'
import * as modules from './modules'
import * as types from './types'
import Settings from './ui/Settings'

const commandsLib = {
	types,
	modules,
	commands,
}

export default plugin({
	start({ decorate }) {
		patchCommands();

		decorate(plugin => {
			plugin.api.commands = commandsLib
		})
	},
	stop() {
		unpatchCommands();
	},
	SettingsComponent: Settings,
})

export type CommandsLibApi = typeof commandsLib

declare module '@valenced/plugins/types' {
	interface PluginApi {
		commands: CommandsLibApi
	}
}
