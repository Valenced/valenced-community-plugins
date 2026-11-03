import { Stores as DiscordStores } from '@valenced/discord/flux'
import { MessageActionCreators } from './modules/actions'
import { ChannelRouter } from './modules/misc'
import type { DiscordModules } from '@valenced/discord/types'
import type { FluxStore } from '@vencord/discord-types'

export function jumpToTop(details: {
	isDifferentChannel: boolean
	channelId?: string
	guildId?: string
}) {
	if (details.isDifferentChannel) {
		ChannelRouter.transitionToChannel(details.channelId!)
	}

	MessageActionCreators.jumpToMessage({
		channelId: details.channelId,
		messageId: details.channelId,
		flash: true,
		jumpType: 'ANIMATED',
	})
}

export type ToValencedStore<T extends FluxStore> = DiscordModules.Flux.Store<
	Omit<T, keyof FluxStore>
>

type VencordTypes = typeof import('@vencord/discord-types/src/stores')

type Stores = {
	[K in keyof VencordTypes]: ToValencedStore<InstanceType<VencordTypes[K]>>
}

export const Stores: Stores = DiscordStores as Stores
