import { React } from '@valenced/react'
import { Icons } from '../../modules/misc'
import { jumpToTop } from '../../utils'
import type { DiscordModules } from '@valenced/discord/types'

type JumpToTopButtonProps = {
	JumpToPresentIconButton: React.ReactElement<DiscordModules.Components.IconButtonProps>
	channelId: string
	isDifferentChannel: boolean
}

export function JumpToTopButton({
	JumpToPresentIconButton,
	channelId,
	isDifferentChannel,
}: JumpToTopButtonProps) {
	return React.cloneElement(JumpToPresentIconButton, {
		icon: Icons.ArrowLargeUpIcon,
		onPress: () => jumpToTop({ isDifferentChannel, channelId }),
	})
}
