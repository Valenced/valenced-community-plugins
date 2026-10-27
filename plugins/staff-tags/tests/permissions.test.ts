/// <reference types="node" />
import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import { mockValenced } from './valenced'

// After the stand-ins exist (tests/valenced.ts).
const { clearDiscordModules } = await import('../js/lib/discord')
const { default: getTag, PERMISSION_BITS } = await import('../js/lib/getTag')
const { watchPermissionHelper } = await import('../js/lib/permissions')
const { DEFAULTS, setStorage } = await import('../js/lib/state')

import type { JsonStorage } from '@valenced/json-storage'
import type { Guild, User } from '../js/lib/discord'
import type { StaffTagsStorage } from '../js/types'

const guild: Guild = { id: 'guild', ownerId: 'owner' }
const admin: User = { id: 'admin' }
const member: User = { id: 'member' }

/** What the plugin's members have in the guild, as Discord's PermissionUtils answers it. */
const memberBits: Record<string, bigint | string> = {
	admin: PERMISSION_BITS.ADMINISTRATOR,
	member: 0n,
}

/**
 * Discord's `PermissionStore`: a Flux store that also has `computePermissions`. Its method uses
 * `this` and answers for the *current* user (here an admin), whoever is asked about.
 */
class PermissionStore {
	currentUserBits = PERMISSION_BITS.ADMINISTRATOR
	addChangeListener() {}
	computePermissions(_context: unknown) {
		return this.currentUserBits
	}
}

/** Discord's PermissionUtils: `computePermissions({ user, context, overwrites })` for anyone. */
const permissionUtils = {
	canEveryoneRole: () => false,
	computePermissions: ({ user }: { user: User }) => memberBits[user.id] ?? 0n,
}

/**
 * `getModules` as Valenced runs it: modules are checked in registry order, a `withProps` filter
 * matches a module with every named prop (on it or on `default`), and the callback gets the first
 * `max` matches, one by default.
 */
function useRegistry(registry: object[]) {
	const has = (module: object, prop: string) =>
		prop in module || prop in ((module as { default?: object }).default ?? {})
	const restoreFilters = mockValenced('@valenced/modules/finders/filters', {
		withProps: (...props: string[]) => ({ props }),
	})
	const restoreFinders = mockValenced('@valenced/modules/finders', {
		getModules: (
			filter: { props: string[] },
			callback: (module: object) => void,
			options?: { max?: number },
		) => {
			const matches = registry.filter(module =>
				filter.props.every(prop => has(module, prop)),
			)
			for (const module of matches.slice(0, options?.max ?? 1)) callback(module)
			return () => {}
		},
	})
	return () => {
		restoreFinders()
		restoreFilters()
	}
}

let restore: () => void = () => {}

beforeEach(() => {
	clearDiscordModules()
	setStorage({
		cache: { ...DEFAULTS },
	} as unknown as JsonStorage<StaffTagsStorage>)
})

afterEach(() => {
	restore()
	clearDiscordModules()
	setStorage(undefined)
})

test('the permission helper is PermissionUtils even when PermissionStore loads first', () => {
	restore = useRegistry([new PermissionStore(), permissionUtils])
	watchPermissionHelper(() => {})
	assert.equal(getTag(guild, undefined, admin, false)?.id, 'admin')
	assert.equal(getTag(guild, undefined, member, false), undefined)
})

test("a store is never used: it would give everyone the current user's permissions", () => {
	restore = useRegistry([new PermissionStore()])
	watchPermissionHelper(() => {})
	assert.equal(getTag(guild, undefined, member, false), undefined)
})

test('computePermissionsForMember wins over computePermissions when a build has both', () => {
	const forMember = {
		computePermissionsForMember: () => PERMISSION_BITS.KICK_MEMBERS,
	}
	restore = useRegistry([permissionUtils, forMember])
	watchPermissionHelper(() => {})
	assert.equal(getTag(guild, undefined, member, false)?.id, 'mod')
})

test('a bitmask returned as a decimal string is read too', () => {
	const stringly = {
		canEveryoneRole: () => false,
		computePermissions: () => String(PERMISSION_BITS.MANAGE_ROLES),
	}
	restore = useRegistry([stringly])
	watchPermissionHelper(() => {})
	assert.equal(getTag(guild, undefined, member, false)?.id, 'staff')
})
