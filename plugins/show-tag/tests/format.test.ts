/// <reference types="node" />
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { formatName, formatReplyName, isTagless, ZWSP } from '../js/lib/format'

const current = { username: 'wumpus', discriminator: '0' }
const legacy = { username: 'Clyde', discriminator: '0001', bot: true }
const webhook = { username: 'Hook', discriminator: '0000', bot: true }

describe('isTagless', () => {
	test('missing users and webhooks have no tag to show', () => {
		assert.equal(isTagless(undefined), true)
		assert.equal(isTagless(webhook), true)
	})

	test('people and bots with a tag are kept', () => {
		assert.equal(isTagless(current), false)
		assert.equal(isTagless(legacy), false)
		// A person whose account kept an all-zero tag is not a webhook.
		assert.equal(isTagless({ username: 'x', discriminator: '0000' }), false)
	})
})

describe('formatName on the current account system', () => {
	test('appends the handle when a nickname or display name is shown', () => {
		assert.equal(
			formatName('Wumpus the Great', current, false),
			'Wumpus the Great (@wumpus)',
		)
	})

	test('leaves the name alone when it already is the username, whatever the case', () => {
		assert.equal(formatName('wumpus', current, false), 'wumpus')
		assert.equal(formatName('Wumpus', current, false), 'Wumpus')
	})
})

describe('formatName on legacy accounts and bots', () => {
	test('shows the full tag in brackets when a different name is shown', () => {
		assert.equal(
			formatName('Clyde Bot', legacy, false),
			'Clyde Bot (Clyde#0001)',
		)
	})

	test('appends the discriminator when the username is shown', () => {
		assert.equal(formatName('Clyde', legacy, false), 'Clyde#0001')
	})
})

describe('only show usernames', () => {
	test('replaces the shown name with the username behind a zero-width space', () => {
		assert.equal(formatName('Wumpus the Great', current, true), `${ZWSP}wumpus`)
		assert.equal(formatName('Clyde Bot', legacy, true), `${ZWSP}Clyde`)
	})
})

describe('formatReplyName', () => {
	test('keeps the @ prefix the preview had', () => {
		assert.equal(
			formatReplyName('@Wumpus the Great', current, false),
			'@Wumpus the Great (@wumpus)',
		)
		assert.equal(
			formatReplyName('@Wumpus the Great', current, true),
			`@${ZWSP}wumpus`,
		)
	})

	test('adds no prefix when the preview had none', () => {
		assert.equal(
			formatReplyName('Clyde Bot', legacy, false),
			'Clyde Bot (Clyde#0001)',
		)
	})
})
