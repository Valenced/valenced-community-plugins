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
		{ path: `assets/fonts/Quicksand-${style}.ttf`, weight: wght },
	]
}

export default plugin({
	preInit({ themes }) {
		themes.registerGroup('dead1nsane', {
			name: 'DEAD1nsane',
			description: 'Fonts by Rairof',
		})

		themes.registerFontPack('dead1nsane', 'quicksand', {
			name: 'Quicksand',
			description: 'Friendly geometric sans-serif with rounded qualities.',
			families: fontFamilies,
		})
	},
})