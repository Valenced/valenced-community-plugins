/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isDarkColor, parseColor } from '../js/lib/color'

test('parseColor reads hex, short hex and RGB, and normalises to #RRGGBB', () => {
	assert.equal(parseColor('#f0b232'), '#F0B232')
	assert.equal(parseColor('f0b232'), '#F0B232')
	assert.equal(parseColor('  #abc  '), '#AABBCC')
	assert.equal(parseColor('240, 178, 50'), '#F0B232')
	assert.equal(parseColor('rgb(240 178 50)'), '#F0B232')
	assert.equal(parseColor('rgba(0, 0, 0, 0.5)'), '#000000')
})

test('parseColor rejects what it cannot read', () => {
	for (const input of [
		'',
		'   ',
		'#12',
		'#abcd',
		'red',
		'256, 0, 0',
		'#ggg000',
	]) {
		assert.equal(parseColor(input), undefined, input)
	}
})

test('isDarkColor picks white text on dark backgrounds and black on light ones', () => {
	assert.equal(isDarkColor('#000000'), true)
	assert.equal(isDarkColor('#5865F2'), true)
	assert.equal(isDarkColor('#F23F42'), true)
	assert.equal(isDarkColor('#FFFFFF'), false)
	assert.equal(isDarkColor('#F0B232'), false)
	assert.equal(isDarkColor('99aab5'), false)
	// Anything that isn't hex is treated as dark, so the text stays white.
	assert.equal(isDarkColor('not a colour'), true)
})
