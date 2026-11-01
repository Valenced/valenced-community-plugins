import { getModules, lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { after, instead } from '@valenced/patcher'
import SettingsComponent from './settings'
import { DefaultSettings } from './shared'
import type { JsonStorage } from '@valenced/json-storage'
import type { Settings } from './shared'

interface GuildNotificationSettingsActionCreators {
	updateGuildNotificationSettings(
		guildId: string,
		settings: {
			muted: boolean
			suppress_everyone: boolean
			suppress_roles: boolean
		},
	): unknown
}

interface GuildActionCreators {
	joinGuild(
		guildId: string,
		options?: { lurker?: boolean;[key: string]: unknown },
	): Promise<unknown>
	transitionToGuildSync(guildId: string): unknown
}

interface InstantInviteActionCreators {
	acceptInvite(options: { inviteKey: string }): Promise<Invite | undefined>
	acceptInviteAndTransitionToInviteChannel(options: unknown): Promise<unknown>
}

interface Invite {
	guild_id?: string
	guild?: { id: string }
	new_member?: boolean
}

let storage: JsonStorage<Settings>

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: {
		load: true,
		default: DefaultSettings,
	},
	start({ cleanup, jsonStorage }) {
		storage = jsonStorage

		cleanup(
			getModules(
				withProps<InstantInviteActionCreators>(
					'acceptInvite',
					'acceptInviteAndTransitionToInviteChannel',
				),
				InstantInviteActionCreators => {
					cleanup(
						after(InstantInviteActionCreators, 'acceptInvite', result => {
							result.then(invite => {
								if (!invite?.new_member) return

								const guildId = invite.guild_id ?? invite.guild?.id
								if (guildId) muteGuild(guildId)
							}, noop)

							return result
						}),
					)
				},
			),
			getModules(
				withProps<GuildActionCreators>('joinGuild', 'transitionToGuildSync'),
				GuildActionCreators => {
					cleanup(
						instead(
							GuildActionCreators,
							'joinGuild',
							function (args, original) {
								const result = Reflect.apply(original, this, args)
								const [guildId, options] = args

								if (!options?.lurker)
									result.then(() => muteGuild(guildId), noop)

								return result
							},
						),
					)
				},
			),
		)
	},
	SettingsComponent,
})

function noop() { }

function muteGuild(guildId: string) {
	const [GuildNotificationSettingsActionCreators] = lookupModule(
		withProps<GuildNotificationSettingsActionCreators>(
			'updateGuildNotificationSettings',
		),
	)
	const { muted, suppressEveryone, suppressRoles } = {
		...DefaultSettings,
		...storage.cache,
	}

	GuildNotificationSettingsActionCreators?.updateGuildNotificationSettings(
		guildId,
		{
			muted,
			suppress_everyone: suppressEveryone,
			suppress_roles: suppressRoles,
		},
	)
}
