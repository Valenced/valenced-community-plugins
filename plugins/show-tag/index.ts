import { Stores } from '@valenced/discord/flux'
import { getModules } from '@valenced/modules/finders'
import { withName } from '@valenced/modules/finders/filters'
import { after } from '@valenced/patcher'
import { getErrorStack } from '@valenced/utils/error'
import SettingsComponent from './settings'
import { DefaultSettings } from './shared'
import type { DiscordModules } from '@valenced/discord/types'
import type { Settings } from './shared'

interface RowManager {
	prototype: {
		generate(row: unknown): MessageRow
	}
}

interface MessageRow {
	type?: number
	message?: RowMessage
}

interface RowMessage {
	username?: string
	authorId?: string
	referencedMessage?: { message?: RowMessage }
}

interface User {
	username: string
	discriminator: string
	bot?: boolean
}

const MessageRowType = 1

// Stops Discord from recognising the name and putting the nickname back
const ZWSP = '​'

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: {
		load: true,
		default: DefaultSettings,
	},
	start({ cleanup, jsonStorage, plugin }) {
		if (plugin.startedLate) {
			plugin.requireReload()
			return
		}

		const UserStore = Stores.UserStore as DiscordModules.Flux.Store<{
			getUser(id: string): User | undefined
		}>

		const rename = (message: RowMessage) => {
			const user = message.authorId && UserStore.getUser(message.authorId)
			// Webhooks have no real username to show
			if (!user || (user.bot && user.discriminator === '0000')) return
			if (message.username == null) return

			// Reply previews can start with "@"
			const at = message.username.startsWith('@') ? '@' : ''
			const shown = message.username.slice(at.length)
			const onlyUsername =
				jsonStorage.cache?.onlyUsername ?? DefaultSettings.onlyUsername

			message.username = at + formatName(shown, user, onlyUsername)
		}

		cleanup(
			// modules/messages/native/renderer/RowGenerator.tsx
			getModules(withName<RowManager>('RowManager'), ({ prototype }) => {
				cleanup(
					after(prototype, 'generate', row => {
						const message = row?.type === MessageRowType ? row.message : null
						if (!message) return row

						try {
							rename(message)

							const reply = message.referencedMessage?.message
							if (reply) rename(reply)
						} catch (e) {
							plugin.reportError(`Failed to add usernames: ${getErrorStack(e)}`)
						}

						return row
					}),
				)
			}),
		)
	},
	SettingsComponent,
})

function formatName(shown: string, user: User, onlyUsername: boolean) {
	if (onlyUsername) return ZWSP + user.username

	if (user.discriminator === '0') {
		if (shown.toLowerCase() === user.username) return shown
		return `${shown} (@${user.username})`
	}

	// Bots still have discriminators
	if (shown !== user.username)
		return `${shown} (${user.username}#${user.discriminator})`
	return `${shown}#${user.discriminator}`
}
