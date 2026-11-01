export interface Settings {
	muted: boolean
	suppressEveryone: boolean
	suppressRoles: boolean
}

export const DefaultSettings: Settings = {
	muted: false,
	suppressEveryone: true,
	suppressRoles: true,
}
