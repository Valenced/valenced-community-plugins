import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { messageUtil } from './modules'
import { ApplicationCommandInputType, ApplicationCommandType } from './types'
import type { ApplicationCommand } from './types'

let commands: ApplicationCommand[] = []
const patches = new Set<() => void>()

export function getCommands() {
	return commands
}

export function patchCommands() {
	getModules(withProps('getBuiltInCommands'), commandsModule => {
		const unpatchGetBuiltInCommands = instead(
			commandsModule,
			'getBuiltInCommands',
			(args, orig) => {
				const res = orig.apply(commandsModule, args)
				const commandType = args[0]

				return res.concat(
					commands
						.filter(c => {
							if (Array.isArray(commandType)) {
								return commandType.includes(c.type)
							}
							return c.type === commandType
						})
						.filter(c => {
							return !c.shouldHide?.()
						}),
				)
			},
		)

		patches.add(unpatchGetBuiltInCommands)
	})
}

export function registerCommand(command: ApplicationCommand): () => void {
	const unsubscribe = getModules(
		withProps('getBuiltInCommands'),
		commandsModule => {
			// Get built in commands
			let builtInCommands: ApplicationCommand[]
			try {
				builtInCommands = commandsModule.getBuiltInCommands(
					ApplicationCommandType.CHAT,
					true,
					false,
				)
			} catch {
				builtInCommands = commandsModule.getBuiltInCommands(
					Object.values(ApplicationCommandType),
					true,
					false,
				)
			}

			builtInCommands.sort(
				(a: ApplicationCommand, b: ApplicationCommand) =>
					parseInt(b.id!) - parseInt(a.id!),
			)
			const lastCommand = builtInCommands[builtInCommands.length - 1]

			// Override the new command's id to the last command id - 1
			command.id = (parseInt(lastCommand.id!, 10) - 1).toString()

			// Fill optional args
			command.shouldHide
			command.applicationId ??= '-1'
			command.type ??= ApplicationCommandType.CHAT
			command.inputType = ApplicationCommandInputType.BUILT_IN
			command.displayName ??= command.name
			command.untranslatedName ??= command.name
			command.displayDescription ??= command.description
			command.untranslatedDescription ??= command.description

			if (command.options)
				for (const opt of command.options) {
					opt.displayName ??= opt.name
					opt.displayDescription ??= opt.description
				}

			instead(command, 'execute', (args, orig) => {
				Promise.resolve(orig.apply(command, args)).then(ret => {
					if (ret && typeof ret === 'object') {
						messageUtil.sendMessage(args[1].channel.id, ret)
					}
				})
			})

			// Add it to the commands array
			commands.push(command)
		},
	)

	// Return command id so it can be unregistered. Cancelling before the
	// module is available keeps the command from being registered at all.
	return () => {
		unsubscribe()
		commands = commands.filter(({ id }) => id !== command.id)
	}
}
