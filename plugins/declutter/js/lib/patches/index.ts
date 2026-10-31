import { patchAvatarDecorations } from './avatarDecorations'
import { patchBadges } from './badges'
import { patchBoostGoal } from './boostGoal'
import { patchChannelNameEmojis } from './channelNameEmojis'
import { patchDisplayNameStyles } from './displayNameStyles'
import { patchDmActivityCards } from './dmActivityCards'
import { patchMessageClutter } from './messageClutter'
import { patchNameplates } from './nameplates'
import { patchProfileEffects } from './profileEffects'
import { patchProfileFrames } from './profileFrames'
import { patchServerTags } from './serverTags'
import { patchServerThemes } from './serverThemes'
import { patchWishlist } from './wishlist'
import { patchYouDock } from './youDock'
import type { PluginCleanupApi } from '@valenced/plugins/types'

export function patchAll(cleanup: PluginCleanupApi): void {
	patchAvatarDecorations(cleanup)
	patchMessageClutter(cleanup)
	patchNameplates(cleanup)
	patchProfileEffects(cleanup)
	patchProfileFrames(cleanup)
	patchServerTags(cleanup)
	patchBadges(cleanup)
	patchWishlist(cleanup)
	patchYouDock(cleanup)
	patchBoostGoal(cleanup)
	patchChannelNameEmojis(cleanup)
	patchDisplayNameStyles(cleanup)
	patchDmActivityCards(cleanup)
	patchServerThemes(cleanup)
}
