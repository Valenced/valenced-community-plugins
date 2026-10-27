/// <reference types="node" />

// @ts-expect-error Bun's types aren't installed in this repository; these tests run under `bun test`.
import { mock } from 'bun:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { describe, test } from 'node:test'

// In the app, the build turns the plugin's `react` import into Discord's own React. This repository
// installs React only as react-native's dependency, so the tests load that copy and hand it to the
// code under test as `react`.
const requireFromReactNative = createRequire(
	createRequire(import.meta.url).resolve('react-native/package.json'),
)
const React: typeof import('react') = requireFromReactNative('react')
mock.module('react', () => React)
const { createElement, isValidElement } = React
const { pruneDM, pruneFriends, pruneProfile, pruneVoice } = await import(
	'../js/lib/prune'
)

import { DEFAULTS } from '../js/settings'
import type { ReactElement, ReactNode } from 'react'
import type { HideCallButtonsStorage } from '../js/settings'

const press = () => {}
const view = (props: Record<string, unknown>, ...children: ReactNode[]) =>
	createElement('View', props, ...children)
const button = (label: string, extra: Record<string, unknown> = {}) =>
	view({ onPress: press, testID: label, ...extra })

const all = (
	overrides: Partial<HideCallButtonsStorage> = {},
): HideCallButtonsStorage => ({ ...DEFAULTS, ...overrides })

type Tagged = { testID?: string; children?: ReactNode; trailing?: ReactNode }

/** Every `testID` left in the tree, in document order. */
function ids(node: ReactNode): string[] {
	if (Array.isArray(node)) return node.flatMap(ids)
	// Any element shape, including the pre-19 tag the last tests use.
	const element = node as { $$typeof?: unknown; props?: Tagged } | null
	if (!isValidElement<Tagged>(node) && !(element?.$$typeof && element.props))
		return []
	const props = (element as { props: Tagged }).props
	const own = props.testID ? [props.testID] : []
	return [...own, ...ids(props.trailing), ...ids(props.children)]
}

describe('profile', () => {
	test('drops the call button, the last action in the row', () => {
		const row = view({}, button('message'), button('call'))
		assert.deepEqual(ids(pruneProfile(row, all())), ['message'])
	})

	test('leaves the row alone when switched off or when there is only one action', () => {
		const row = view({}, button('message'), button('call'))
		assert.equal(pruneProfile(row, all({ upHideVoiceButton: false })), row)
		const lone = view({}, button('message'))
		assert.equal(pruneProfile(lone, all()), lone)
	})

	test('removes a wrapper that held only the call button, and never edits the original', () => {
		const row = view(
			{},
			view({ testID: 'cell-a' }, button('message')),
			view({ testID: 'cell-b' }, button('call')),
		)
		assert.deepEqual(ids(pruneProfile(row, all())), ['cell-a', 'message'])
		assert.deepEqual(ids(row), ['cell-a', 'message', 'cell-b', 'call'])
	})
})

describe('DM header', () => {
	const header = () =>
		view(
			{},
			button('call', { disabled: false }),
			button('video', { disabled: false }),
			button('search'),
		)

	test('call and video are told apart by the disabled prop, in order', () => {
		assert.deepEqual(ids(pruneDM(header(), all({ dmHideCallButton: true }))), [
			'video',
			'search',
		])
		assert.deepEqual(ids(pruneDM(header(), all({ dmHideVideoButton: true }))), [
			'call',
			'search',
		])
		const both = all({ dmHideCallButton: true, dmHideVideoButton: true })
		assert.deepEqual(ids(pruneDM(header(), both)), ['search'])
	})

	test('does nothing with both switches off', () => {
		const tree = header()
		assert.equal(pruneDM(tree, all()), tree)
	})
})

describe('friends list', () => {
	const row = (names: string[], buttons: string[]) =>
		view({
			accessibilityActions: names.map(name => ({ name })),
			trailing: view({}, ...buttons.map(id => button(id))),
		})
	const on = all({ friendsHideCallButton: true })

	test('drops the call action and the button at the same index', () => {
		const out = pruneFriends(
			view({}, row(['message', 'call'], ['message', 'call'])),
			on,
		)
		assert.deepEqual(ids(out), ['message'])
		type Row = ReactElement<{ accessibilityActions: unknown[] }>
		const inner = (out as ReactElement<{ children: Row }>).props.children
		assert.deepEqual(inner.props.accessibilityActions, [{ name: 'message' }])
	})

	test('skips a row whose actions and buttons no longer line up', () => {
		const tree = view({}, row(['message', 'call'], ['message']))
		assert.equal(pruneFriends(tree, on), tree)
	})
})

test('voice channel camera renders nothing when hidden', () => {
	const camera = button('camera')
	assert.equal(pruneVoice(camera, all({ hideVCVideoButton: true })), null)
	assert.equal(pruneVoice(camera, all()), camera)
})

describe('elements React 19 does not recognise as its own', () => {
	/** An element tagged the pre-19 way, which `isValidElement` rejects in React 19. */
	const legacy = (props: Record<string, unknown>) => ({
		$$typeof: Symbol.for('react.element'),
		type: 'View',
		key: null,
		ref: null,
		props,
	})
	const legacyButton = (label: string, disabled?: boolean) =>
		legacy({
			onPress: press,
			testID: label,
			...(disabled === undefined ? {} : { disabled }),
		})

	test('DM header buttons built that way are still found and hidden', () => {
		const header = legacy({
			children: [
				legacyButton('call', false),
				legacyButton('video', false),
				legacyButton('search'),
			],
		}) as unknown as ReactNode
		const both = all({ dmHideCallButton: true, dmHideVideoButton: true })
		assert.deepEqual(ids(pruneDM(header, both)), ['search'])
	})

	test('the profile call button built that way is still hidden', () => {
		const row = legacy({
			children: [legacyButton('message'), legacyButton('call')],
		}) as unknown as ReactNode
		assert.deepEqual(ids(pruneProfile(row, all())), ['message'])
	})
})
