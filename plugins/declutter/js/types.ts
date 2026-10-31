import type { SurfacePreferences } from './customization/surfacePreferences'
export interface DeclutterSettings {
	customizeMessageActions: boolean
	customizeSettings: boolean
	surfaces?: Record<string, SurfacePreferences>
	/** Hide collectible avatar decorations */
	avatarDecorations: boolean
	/** Hide collectible nameplates behind usernames */
	nameplates: boolean
	/** Hide animated profile effects on user profiles */
	profileEffects: boolean
	/** Hide collectible profile frames around profile avatars */
	profileFrames: boolean
	/** Hide server (clan) tags in chat and on profiles */
	serverTags: boolean
	/** Hide badges shown on user profiles */
	badges: boolean
	/** Hide Quest dock (floating quest bar at bottom) */
	questDock: boolean
	/** Hide Quests button on YouTab floating bar */
	youTabQuestsButton: boolean
	/** Hide Shop button on YouTab floating bar */
	youTabShopButton: boolean
	/** Hide Nitro button on YouTab floating bar */
	youTabNitroButton: boolean
	/** Hide the Orbs balance bar on the YouScreen profile */
	youTabOrbsBalance: boolean
	/** Hide Wishlist tab on user profiles */
	wishlist: boolean
	/** Hide Boost Goal bar in channel list */
	boostGoal: boolean
	channelNameEmojis: boolean
	serverThemes: boolean
	dmActivityCards: boolean
	displayNameStyles: boolean
}
