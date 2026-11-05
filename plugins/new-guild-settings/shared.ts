export enum MessageNotifications {
	AllMessages = 0,
	OnlyMentions = 1,
	NoMessages = 2,
	ServerDefault = 3,
}

export interface Settings {
	muted: boolean
	messageNotifications: MessageNotifications
	suppressEveryone: boolean
	suppressRoles: boolean
	suppressHighlights: boolean
	muteEvents: boolean
	muteMobilePush: boolean
	showAllChannels: boolean
	hideVoiceNames: boolean
}

export const DefaultSettings: Settings = {
	muted: false,
	messageNotifications: MessageNotifications.ServerDefault,
	suppressEveryone: true,
	suppressRoles: true,
	suppressHighlights: true,
	muteEvents: true,
	muteMobilePush: true,
	showAllChannels: true,
	hideVoiceNames: false,
}
