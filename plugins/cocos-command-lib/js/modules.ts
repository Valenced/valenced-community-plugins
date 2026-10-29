import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'

export let commands: any
export let messageUtil: any

getModules(withProps('sendBotMessage'), exports => {
	messageUtil = exports
})

getModules(withProps('getBuiltInCommands'), exports => {
	commands = exports
})
