/// <reference types="@valenced/themes-api" />

import type { FontVariant } from '@valenced/themes-api/types'

const Weights: Record<string, number> = {
	Normal: 400,
	Medium: 500,
	Semibold: 600,
	Bold: 700,
	ExtraBold: 800,
}

const fontFamilies: Record<string, FontVariant[]> = {}
for (const [style, wght] of Object.entries(Weights)) {
	fontFamilies[`ggsans-${style}`] = [
		{ path: `assets/fonts/Gantari-${style}.ttf`, weight: wght },
		{ path: `assets/fonts/Gantari-${style}Italic.ttf`, weight: wght, italic: true },
	]
}

export default plugin({
	preInit({ themes }) {
		themes.registerGroup('dead1nsane', {
			name: 'DEAD1nsane',
			description: 'Themes and fonts by im__turbo__',
		})

		themes.registerFontPack('dead1nsane', 'gantari', {
			name: 'Gantari',
			description: 'Clean geometric sans-serif font. Best paired with RBW AMOLED.',
			families: fontFamilies,
		})
	},
})