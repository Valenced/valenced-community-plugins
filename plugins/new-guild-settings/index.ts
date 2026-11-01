import { Stores } from '@valenced/discord/flux'
import { getModules, lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { after, instead } from '@valenced/patcher'
import SettingsComponent from './settings'
import { DefaultSettings, MessageNotifications } from './shared'
import type { DiscordModules } from '@valenced/discord/types'
import type { JsonStorage } from '@valenced/json-storage'
import type { Settings } from './shared'

interface GuildNotificationSettingsActionCreators {
	updateGuildNotificationSettings(
		guildId: string,
		settings: {
			muted?: boolean
			mobile_push?: boolean
			suppress_everyone?: boolean
			suppress_roles?: boolean
			mute_scheduled_events?: boolean
			notify_highlights?: HighlightSettings
			message_notifications?: MessageNotifications
		},
	): unknown
}

enum HighlightSettings {
	Null = 0,
	Disabled = 1,
}

interface OptInModule {
	isOptInEnabledForGuild(guildId: string): boolean
}

interface OptInOnboardingUtils {
	toggleShowAllChannels(guildId: string): unknown
}

interface ChannelCollapseActionCreators {
	update(channelId: string): unknown
	toggleCollapseGuild(guildId: string): unknown
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
								if (guildId) applySettings(guildId)
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
									result.then(() => applySettings(guildId), noop)

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

function applySettings(guildId: string) {
	const [GuildNotificationSettingsActionCreators] = lookupModule(
		withProps<GuildNotificationSettingsActionCreators>(
			'updateGuildNotificationSettings',
		),
	)
	const settings = { ...DefaultSettings, ...storage.cache }

	GuildNotificationSettingsActionCreators?.updateGuildNotificationSettings(
		guildId,
		{
			muted: settings.muted,
			mobile_push: !settings.muteMobilePush,
			suppress_everyone: settings.suppressEveryone,
			suppress_roles: settings.suppressRoles,
			mute_scheduled_events: settings.muteEvents,
			notify_highlights: settings.suppressHighlights
				? HighlightSettings.Disabled
				: HighlightSettings.Null,
			...(settings.messageNotifications !==
				MessageNotifications.ServerDefault && {
				message_notifications: settings.messageNotifications,
			}),
		},
	)

	if (settings.showAllChannels) showAllChannels(guildId)
	if (settings.hideVoiceNames) hideVoiceNames(guildId)
}

function showAllChannels(guildId: string) {
	const [OptIn] = lookupModule(withProps<OptInModule>('isOptInEnabledForGuild'))
	const [OptInOnboardingUtils] = lookupModule(
		withProps<OptInOnboardingUtils>('toggleShowAllChannels'),
	)

	if (OptIn?.isOptInEnabledForGuild(guildId))
		OptInOnboardingUtils?.toggleShowAllChannels(guildId)
}

function hideVoiceNames(guildId: string) {
	const [ChannelCollapseActionCreators] = lookupModule(
		withProps<ChannelCollapseActionCreators>('update', 'toggleCollapseGuild'),
	)
	const ChannelStore = Stores.ChannelStore as DiscordModules.Flux.Store<{
		getChannelIds(guildId: string): string[]
		getChannel(channelId: string): { isGuildVocal(): boolean } | undefined
	}>
	const CollapsedVoiceChannelStore =
		Stores.CollapsedVoiceChannelStore as DiscordModules.Flux.Store<{
			isCollapsed(channelId: string): boolean
		}>

	for (const channelId of ChannelStore.getChannelIds(guildId)) {
		if (
			ChannelStore.getChannel(channelId)?.isGuildVocal() &&
			!CollapsedVoiceChannelStore.isCollapsed(channelId)
		)
			ChannelCollapseActionCreators?.update(channelId)
	}
}
