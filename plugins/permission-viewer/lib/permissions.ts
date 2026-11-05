import { Constants } from '@valenced/discord/common/constants'
import { lookupModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { lookupModules } from '@valenced/modules/finders'
import { withDependencies, withProps } from '@valenced/modules/finders/filters'
import { api } from '..'
import { getEveryoneRole, getGuild } from './stores'
import type { Channel, Role } from './stores'

export interface PermissionEntry {
	name: string
	flag: bigint
	label: string
}

export interface PermissionCategory {
	label: string
	permissions: PermissionEntry[]
}

/**
 * ADMINISTRATOR implies every other bit.
 * `initPermissions` resolves the map before use.
 */
let flags: Record<string, bigint> | undefined

// The catalog is in flags, the grid in names
let namesByFlag = new Map<bigint, string>()

export function initPermissions() {
	const map = (
		Constants as { Permissions?: Record<string, bigint> } | undefined
	)?.Permissions
	if (!map)
		throw new Error('the client Constants.Permissions map is unavailable')
	flags = map

	const names = new Map<bigint, string>()
	for (const [name, flag] of Object.entries(map)) {
		if (!names.has(flag)) names.set(flag, name)
	}
	namesByFlag = names
}

//One named flag; throws if read before init
export function permissionFlagOf(name: string): bigint {
	if (!flags)
		throw new Error('permission flags were read before the map resolved')
	const value = flags[name]
	if (value === undefined)
		throw new Error(`the client has no permission named ${name}`)
	return value
}

const CATALOG_PATH = 'utils/PermissionSpecUtils.tsx'

const ANCHOR_PATHS = [
	'records/ChannelRecord.tsx',
	'stores/GuildStore.tsx',
	// The root aggregator, not discord_common's shared Constants.
	'Constants.tsx',
]

//Initializing modules runs their factories; stop before touching strangers
const MAX_CANDIDATES = 3

interface PermissionSpecItem {
	title: string
	description?: unknown
	flag?: bigint | null
	isExperimental?: boolean
}

interface PermissionSpecSection {
	title: string
	description?: string
	permissions?: PermissionSpecItem[]
}

interface PermissionCatalog {
	generateGuildPermissionSpec(guild: unknown): PermissionSpecSection[]
	generateChannelPermissionSpec(
		guildId: string,
		channel: unknown,
		options?: unknown,
		extra?: unknown,
	): PermissionSpecSection[]
	getGuildPermissionSpecMap(guild: unknown): Record<string, PermissionSpecItem>
}

let catalog!: PermissionCatalog
let catalogError = ''

function pathId(path: string) {
	const result = lookupModuleWithImportedPath(path)
	return result.length === 2 ? result[1] : undefined
}

function pickCatalog(exports: unknown): PermissionCatalog | undefined {
	for (const candidate of [
		exports,
		(exports as { default?: unknown } | undefined)?.default,
	]) {
		if (!candidate || typeof candidate !== 'object') continue
		const value = candidate as Partial<PermissionCatalog>
		if (
			typeof value.generateGuildPermissionSpec === 'function' &&
			typeof value.generateChannelPermissionSpec === 'function' &&
			typeof value.getGuildPermissionSpecMap === 'function'
		)
			return value as PermissionCatalog
	}
	return undefined
}

//initialize the single match, prove it by path
function attemptCatalog(): boolean {
	const anchors = ANCHOR_PATHS.map(pathId).filter(
		(id): id is number => id !== undefined,
	)
	if (anchors.length < ANCHOR_PATHS.length) {
		catalogError = `resolved ${anchors.length}/${ANCHOR_PATHS.length} anchors`
		return false
	}

	const filter = withProps<PermissionCatalog>(
		'generateGuildPermissionSpec',
		'generateChannelPermissionSpec',
		'getGuildPermissionSpecMap',
	).and(withDependencies(withDependencies.partial(anchors)))

	let tried = 0

	try {
		for (const [exports, id] of lookupModules(filter, {
			cached: false,
			initialize: true,
		})) {
			tried++

			if (pathId(CATALOG_PATH) === id) {
				const found = pickCatalog(exports)
				if (!found) {
					catalogError = `module ${id} has no catalog exports`
					return false
				}
				catalog = found
				catalogError = ''
				return true
			}

			if (tried >= MAX_CANDIDATES) break
		}
	} catch (error) {
		catalogError = String(error)
		return false
	}

	catalogError = `${tried} candidate(s), none matched ${CATALOG_PATH}`
	return false
}

export function resolvePermissionCatalog() {
	if (attemptCatalog()) return
	throw new Error(`${CATALOG_PATH} could not be resolved: ${catalogError}`)
}

function toCategories(sections: PermissionSpecSection[]): PermissionCategory[] {
	const categories: PermissionCategory[] = []

	for (const section of sections) {
		const permissions: PermissionEntry[] = []

		for (const item of section.permissions ?? []) {
			// Discord emits `{ flag: null }` for rows that are not a permission.
			if (!item || item.flag === null || item.flag === undefined) continue

			const name = namesByFlag.get(item.flag)
			if (!name) continue

			permissions.push({ name, flag: item.flag, label: item.title })
		}

		if (permissions.length)
			categories.push({ label: section.title, permissions })
	}

	return categories
}

function buildGuildCategories(guildId: string): PermissionCategory[] {
	const guild = getGuild(guildId)
	if (!guild) return []

	try {
		return toCategories(catalog.generateGuildPermissionSpec(guild))
	} catch (error) {
		api?.plugin.reportError(error)
		return []
	}
}

let guildCache: { key: string; categories: PermissionCategory[] } | undefined

/** Permission list in client order; the catalog is guild-feature gated. */
export function permissionCategories(guildId: string): PermissionCategory[] {
	if (guildCache?.key === guildId) return guildCache.categories

	const categories = buildGuildCategories(guildId)
	guildCache = { key: guildId, categories }
	return categories
}

//Every permission this channel type can set
export function channelPermissionCategories(
	channel: Channel,
): PermissionCategory[] {
	try {
		return toCategories(
			catalog.generateChannelPermissionSpec(channel.guild_id, channel),
		)
	} catch (error) {
		api?.plugin.reportError(error)
		return []
	}
}

//Every channel-settable permission, category order kept
export function channelPermissionEntries(channel: Channel): PermissionEntry[] {
	return channelPermissionCategories(channel).flatMap(
		category => category.permissions,
	)
}

//Guild-level bits: every role, @everyone, and owner-implicit admin
export function effectivePermissions(
	guildId: string,
	userId: string,
	roles: Role[],
): bigint {
	let permissions = 0n
	for (const role of roles) permissions |= toBigInt(role.permissions)
	permissions |= toBigInt(getEveryoneRole(guildId)?.permissions)
	if (getGuild(guildId)?.ownerId === userId)
		permissions |= permissionFlagOf('ADMINISTRATOR')

	return permissions
}

export function toBigInt(value: unknown): bigint {
	if (value === null || value === undefined) return 0n
	if (typeof value === 'bigint') return value
	try {
		return BigInt(value as string | number)
	} catch (error) {
		api?.plugin.reportError(error)
		return 0n
	}
}

export function hasFlag(bits: unknown, flag: bigint): boolean {
	return (toBigInt(bits) & flag) === flag
}

/** hasPermission probe; ADMINISTRATOR implies every other bit. */
export function permissionProbe(bits: unknown) {
	const value = toBigInt(bits)
	const administrator = hasFlag(value, permissionFlagOf('ADMINISTRATOR'))

	return (name: string) =>
		administrator || hasFlag(value, permissionFlagOf(name))
}
