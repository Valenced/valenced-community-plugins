import { Design } from '@valenced/discord/design'
import { getModules } from '@valenced/modules/finders'
import { withName } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { ChannelType } from '@vencord/discord-types/enums'
import { Icons } from '../modules/misc'
import { JumpToTopButton } from '../ui/components/JumpToTopButton'
import { Stores } from '../utils'
import type { DiscordModules } from '@valenced/discord/types'
import type { PluginApi, PluginCleanupApi } from '@valenced/plugins/types'

export function patchJumpToPresent({ cleanup }: PluginApi) {
	cleanup(
		getModules(
			withName('JumpToPresentButton'),
			JTPButton => patch(JTPButton, cleanup),
			{
				returnNamespace: true,
			},
		),
	)
}

type IconButtonElement =
	React.ReactElement<DiscordModules.Components.IconButtonProps>

const patch = (JTPButton: any, cleanup: PluginCleanupApi) => {
	const { ChannelStore } = Stores

	cleanup(
		instead(JTPButton, 'default', ([props], original) => {
			const ret = original(props) as React.ReactElement<React.PropsWithChildren>

			if (ret == null) return null

			const JumpToPresentIconButton = ret.props.children as IconButtonElement
            if (!isJumpToPresentButton(JumpToPresentIconButton)) return ret

			const { type: channelType } = ChannelStore.getChannel(props.channelId)
			// Voice channel text counts as different channel
			const isNotCurrentChannel = channelType === ChannelType.GUILD_VOICE

			ret.props.children = (
				<Design.Stack>
					<JumpToTopButton
						JumpToPresentIconButton={JumpToPresentIconButton}
						channelId={props.channelId}
						isDifferentChannel={isNotCurrentChannel}
					/>
					{JumpToPresentIconButton}
				</Design.Stack>
			)

			return ret
		}),
	)
}

function isJumpToPresentButton(button: IconButtonElement) {
    // Discord uses JumpToPresentButton for the close button on voice channels
    return button.props?.icon === Icons.ArrowLargeDownIcon;
}
