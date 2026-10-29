import { Stores } from '@valenced/discord/flux'
import { overrideFor, report } from './shared'
import type { DiscordModules } from '@valenced/discord/types'
import type { ReactNode } from 'react'

export interface Guild {
	id: string
	ownerId?: string
}

export interface Channel {
	id?: string
	guild_id?: string
	permissionOverwrites?: unknown
}

export interface User {
	id: string
	bot?: boolean
	isNonUserBot?(): boolean
}

export interface TagProps {
	type?: number
	text?: string
	textColor?: string
	backgroundColor?: string
	verified?: boolean
	style?: unknown
}

export interface TagModule {
	default: ((props: TagProps) => ReactNode) & { Types?: Record<string, number> }
	getBotLabel?(type: number): unknown
}

type Store<T> = DiscordModules.Flux.Store<T> | undefined

export const stores = {
	guild: () =>
		Stores.GuildStore as Store<{ getGuild(id?: string): Guild | undefined }>,
	channel: () =>
		Stores.ChannelStore as Store<{
			getChannel(id?: string): Channel | undefined
		}>,
	selectedChannel: () =>
		Stores.SelectedChannelStore as Store<{
			getChannelId(): string | undefined
		}>,
	guildMember: () =>
		Stores.GuildMemberStore as Store<{
			getMember(
				guildId: string,
				userId: string,
			): { colorString?: string } | undefined
		}>,
}

// Not in Constants on this platform
const Permissions = {
	KICK_MEMBERS: 1n << 1n,
	BAN_MEMBERS: 1n << 2n,
	ADMINISTRATOR: 1n << 3n,
	MANAGE_CHANNELS: 1n << 4n,
	MANAGE_GUILD: 1n << 5n,
	MANAGE_MESSAGES: 1n << 13n,
	MUTE_MEMBERS: 1n << 22n,
	DEAFEN_MEMBERS: 1n << 23n,
	MOVE_MEMBERS: 1n << 24n,
	MANAGE_ROLES: 1n << 28n,
	MANAGE_WEBHOOKS: 1n << 29n,
	MODERATE_MEMBERS: 1n << 40n,
}

interface TagDef {
	// Storage is keyed by this, so never change one
	id: string
	text: string
	defaultColor: string
	condition?: (guild: Guild | undefined, user: User) => boolean
	permissions?: (keyof typeof Permissions)[]
}

// First match wins
export const TAGS: TagDef[] = [
	{
		id: 'webhook',
		text: 'WEBHOOK',
		defaultColor: '#99AAB5',
		condition: (_guild, user) => user.isNonUserBot?.() ?? false,
	},
	{
		id: 'owner',
		text: 'OWNER',
		defaultColor: '#F0B232',
		condition: (guild, user) => guild?.ownerId === user.id,
	},
	{
		id: 'admin',
		text: 'ADMIN',
		defaultColor: '#F23F42',
		permissions: ['ADMINISTRATOR'],
	},
	{
		id: 'staff',
		text: 'STAFF',
		defaultColor: '#23A55A',
		permissions: [
			'MANAGE_GUILD',
			'MANAGE_CHANNELS',
			'MANAGE_ROLES',
			'MANAGE_WEBHOOKS',
		],
	},
	{
		id: 'mod',
		text: 'MOD',
		defaultColor: '#5865F2',
		permissions: ['MANAGE_MESSAGES', 'KICK_MEMBERS', 'BAN_MEMBERS'],
	},
	{
		id: 'vc_mod',
		text: 'VC Mod',
		defaultColor: '#1ABC9C',
		permissions: ['MOVE_MEMBERS', 'MUTE_MEMBERS', 'DEAFEN_MEMBERS'],
	},
	{
		id: 'chat_mod',
		text: 'Chat Mod',
		defaultColor: '#9B59B6',
		permissions: ['MODERATE_MEMBERS'],
	},
]

export interface ResolvedTag {
	text: string
	textColor: string
	backgroundColor: string
}

type PermissionHelper = (...args: unknown[]) => unknown

export let tagModule: TagModule | undefined
let permissionHelper: PermissionHelper | undefined
let permissionRank = Number.POSITIVE_INFINITY

export function setTagModule(module: TagModule | undefined) {
	tagModule = module
}

export function offerPermissionHelper(helper: unknown, rank: number) {
	if (typeof helper !== 'function' || rank > permissionRank) return
	permissionHelper = helper as PermissionHelper
	permissionRank = rank
}

export function resetModules() {
	tagModule = undefined
	permissionHelper = undefined
	permissionRank = Number.POSITIVE_INFINITY
}

export function isBuiltInTag(type: unknown): boolean {
	if (typeof type !== 'number') return false
	try {
		const label = tagModule?.getBotLabel?.(type)
		return typeof label === 'string' && label.length > 0
	} catch {
		return false
	}
}

export function tagProps(tag: ResolvedTag): TagProps {
	return {
		type: 0,
		text: tag.text,
		textColor: tag.textColor,
		backgroundColor: tag.backgroundColor,
		verified: false,
	}
}

// The argument order differs between builds
const CallShapes: ((
	helper: PermissionHelper,
	guild: Guild,
	channel: Channel | undefined,
	user: User,
) => unknown)[] = [
	(helper, guild, channel, user) =>
		helper({ user, context: guild, overwrites: channel?.permissionOverwrites }),
	(helper, guild, channel, user) =>
		helper({
			user,
			context: guild,
			overwrites: channel?.permissionOverwrites,
			checkElevated: false,
		}),
	(helper, guild, channel, user) => helper(user, guild, channel),
	(helper, guild, channel, user) => helper(guild, channel, user),
]

let shapeFor: PermissionHelper | undefined
let workingShape: number | undefined

function computePermissions(
	guild: Guild,
	channel: Channel | undefined,
	user: User,
): bigint | undefined {
	const helper = permissionHelper
	if (!helper) return
	if (helper !== shapeFor) {
		shapeFor = helper
		workingShape = undefined
	}
	if (workingShape === -1) return

	const candidates =
		workingShape === undefined ? CallShapes.map((_, i) => i) : [workingShape]
	for (const index of candidates) {
		try {
			const result = CallShapes[index](helper, guild, channel, user)
			if (
				typeof result === 'bigint' ||
				typeof result === 'number' ||
				(typeof result === 'string' && /^\d+$/.test(result))
			) {
				workingShape = index
				return BigInt(result)
			}
		} catch {}
	}

	workingShape = -1
	report(
		'Could not compute permissions on this Discord version. ADMIN/STAFF/MOD tags will not appear.',
	)
}

function isDarkColor(hex: string) {
	const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})/i.exec(hex)
	if (!match) return true
	const [r, g, b] = match.slice(1).map(n => Number.parseInt(n, 16))
	return (r * 299 + g * 587 + b * 114) / 1000 < 140
}

export function getTag(
	guild: Guild | undefined,
	channel: Channel | undefined,
	user: User | undefined,
	useRoleColor: boolean,
): ResolvedTag | undefined {
	if (!user) return

	const permissions = guild
		? computePermissions(guild, channel, user)
		: undefined
	const has = (name: keyof typeof Permissions) =>
		permissions !== undefined && (permissions & Permissions[name]) !== 0n

	for (const tag of TAGS) {
		const matches =
			tag.condition?.(guild, user) || (!user.bot && tag.permissions?.some(has))
		if (!matches) continue

		const custom = overrideFor(tag.id)
		if (custom.enabled === false) continue

		const roleColor =
			useRoleColor && guild
				? stores.guildMember()?.getMember(guild.id, user.id)?.colorString
				: undefined
		const backgroundColor =
			(custom.useCustomColor && custom.color) || roleColor || tag.defaultColor

		return {
			text: custom.text?.trim() || tag.text,
			textColor: isDarkColor(backgroundColor) ? '#FFFFFF' : '#000000',
			backgroundColor,
		}
	}
}
