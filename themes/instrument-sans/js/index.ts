/// <reference types="@valenced/themes-api" />

import type { FontVariant } from '@valenced/themes-api/types'

const Weights: Record<string, number> = {
	Regular: 400,
	Medium: 500,
	Semibold: 600,
	Bold: 700,
}

const fontFamilies: Record<string, FontVariant[]> = {}
for (const [style, wght] of Object.entries(Weights)) {
	fontFamilies[`ggsans-${style}`] = [
		{ path: `assets/fonts/InstrumentSans-${style}.ttf`, weight: wght },
	]
}

export default plugin({
	preInit({ themes }) {
		themes.registerGroup('dead1nsane', {
			name: 'DEAD1nsane',
			description: 'Fonts by Rairof',
		})

		themes.registerFontPack('dead1nsane', 'instrument-sans', {
			name: 'Instrument Sans',
			description: 'Modern geometric sans-serif.',
			families: fontFamilies,
		})
	},
})