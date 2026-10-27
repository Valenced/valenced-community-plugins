/// <reference types="node" />
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { mockValenced } from './valenced'

// After the stand-ins exist (tests/valenced.ts).
const { clearDiscordModules, offerPermissionHelper } = await import(
	'../js/lib/discord'
)
const { default: getTag, PERMISSION_BITS } = await import('../js/lib/getTag')
const { DEFAULTS, setStorage } = await import('../js/lib/state')

import type { JsonStorage } from '@valenced/json-storage'
import type { Guild, User } from '../js/lib/discord'
import type { StaffTagsStorage, TagOverride } from '../js/types'

const guild: Guild = { id: 'guild', ownerId: 'owner' }
const person = (id: string, extra: Partial<User> = {}): User => ({
	id,
	...extra,
})

/** Permission bitmasks by user id, answered in the first call shape Discord's helper uses. */
let permissions: Record<string, bigint> = {}

function useStorage(
	tags: Record<string, TagOverride> = {},
	useRoleColor = false,
) {
	setStorage({
		cache: { ...DEFAULTS, useRoleColor, tags },
	} as unknown as JsonStorage<StaffTagsStorage>)
}

beforeEach(() => {
	permissions = {}
	clearDiscordModules()
	offerPermissionHelper(
		(input: { user: User }) => permissions[input.user.id] ?? 0n,
		0,
	)
	useStorage()
})

afterEach(() => {
	clearDiscordModules()
	setStorage(undefined)
})

describe('which tag', () => {
	test('the guild owner is OWNER, ahead of any permission tag', () => {
		permissions.owner = PERMISSION_BITS.ADMINISTRATOR
		assert.equal(getTag(guild, undefined, person('owner'), false)?.id, 'owner')
	})

	test('permissions map to ADMIN, STAFF, MOD, VC Mod and Chat Mod, most important first', () => {
		const cases: Array<[bigint, string]> = [
			[PERMISSION_BITS.ADMINISTRATOR | PERMISSION_BITS.KICK_MEMBERS, 'admin'],
			[PERMISSION_BITS.MANAGE_ROLES, 'staff'],
			[PERMISSION_BITS.BAN_MEMBERS, 'mod'],
			[PERMISSION_BITS.MOVE_MEMBERS, 'vc_mod'],
			[PERMISSION_BITS.MODERATE_MEMBERS, 'chat_mod'],
		]
		for (const [bits, id] of cases) {
			permissions.someone = bits
			assert.equal(getTag(guild, undefined, person('someone'), false)?.id, id)
		}
	})

	test('no tag without a matching permission, and none outside a guild', () => {
		assert.equal(getTag(guild, undefined, person('someone'), false), undefined)
		permissions.someone = PERMISSION_BITS.ADMINISTRATOR
		assert.equal(
			getTag(undefined, undefined, person('someone'), false),
			undefined,
		)
	})

	test('bots never get a permission tag; webhooks get WEBHOOK', () => {
		permissions.bot = PERMISSION_BITS.ADMINISTRATOR
		assert.equal(
			getTag(guild, undefined, person('bot', { bot: true }), false),
			undefined,
		)
		const webhook = person('hook', { bot: true, isNonUserBot: () => true })
		assert.equal(getTag(guild, undefined, webhook, false)?.id, 'webhook')
	})

	test('permission tags wait for the helper instead of giving up for the session', () => {
		clearDiscordModules()
		permissions.someone = PERMISSION_BITS.ADMINISTRATOR
		assert.equal(getTag(guild, undefined, person('someone'), false), undefined)
		offerPermissionHelper(
			(input: { user: User }) => permissions[input.user.id] ?? 0n,
			1,
		)
		assert.equal(
			getTag(guild, undefined, person('someone'), false)?.id,
			'admin',
		)
	})
})

describe('what it looks like', () => {
	test('as it ships: its own text and colour, with readable text', () => {
		permissions.someone = PERMISSION_BITS.ADMINISTRATOR
		const tag = getTag(guild, undefined, person('someone'), false)
		assert.equal(tag?.text, 'ADMIN')
		assert.equal(tag?.backgroundColor, '#F23F42')
		assert.equal(tag?.textColor, '#FFFFFF')
		assert.equal(
			getTag(guild, undefined, person('owner'), false)?.textColor,
			'#000000',
		)
	})

	test('a hidden tag is skipped and the next one that matches is used', () => {
		permissions.someone =
			PERMISSION_BITS.ADMINISTRATOR | PERMISSION_BITS.KICK_MEMBERS
		useStorage({ admin: { enabled: false } })
		assert.equal(getTag(guild, undefined, person('someone'), false)?.id, 'mod')
	})

	test('custom text, colour, gradient and icon come from the override', () => {
		permissions.someone = PERMISSION_BITS.MANAGE_GUILD
		useStorage({
			staff: {
				text: '  Boss  ',
				useCustomColor: true,
				color: '#FFFFFF',
				useGradient: true,
				gradientColor: '#000000',
				icon: 'star',
				iconOnly: true,
			},
		})
		const tag = getTag(guild, undefined, person('someone'), false)
		assert.equal(tag?.text, 'Boss')
		assert.equal(tag?.backgroundColor, '#FFFFFF')
		assert.equal(tag?.textColor, '#000000')
		assert.equal(tag?.gradientColor, '#000000')
		assert.equal(tag?.icon, 'star')
		assert.equal(tag?.iconOnly, true)
		assert.equal(tag?.iconGlyph, '★')
	})

	test('a reset override reads as the tag as it ships', () => {
		permissions.someone = PERMISSION_BITS.MANAGE_GUILD
		useStorage({
			staff: {
				enabled: true,
				text: '',
				icon: 'none',
				useCustomColor: false,
				color: '',
				useGradient: false,
			},
		})
		const tag = getTag(guild, undefined, person('someone'), false)
		assert.equal(tag?.text, 'STAFF')
		assert.equal(tag?.backgroundColor, '#23A55A')
		assert.equal(tag?.icon, undefined)
		assert.equal(tag?.gradientColor, undefined)
	})

	test('the top role colour is used when asked, but a chosen colour still wins', () => {
		permissions.someone = PERMISSION_BITS.ADMINISTRATOR
		const restore = mockValenced('@valenced/discord/flux', {
			Stores: {
				GuildMemberStore: { getMember: () => ({ colorString: '#FFFFFF' }) },
			},
		})
		try {
			useStorage({}, true)
			assert.equal(
				getTag(guild, undefined, person('someone'), true)?.backgroundColor,
				'#FFFFFF',
			)
			useStorage({ admin: { useCustomColor: true, color: '#123456' } }, true)
			assert.equal(
				getTag(guild, undefined, person('someone'), true)?.backgroundColor,
				'#123456',
			)
		} finally {
			restore()
		}
	})
})
