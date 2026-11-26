/// <reference types="@valenced/themes-api" />

import type { FontVariant } from '@valenced/themes-api/types'

const Weights: Record<string, number> = {
	Regular: 400,
	Medium: 500,
	Bold: 700,
}

const fontFamilies: Record<string, FontVariant[]> = {}
for (const [style, wght] of Object.entries(Weights)) {
	fontFamilies[`ggmono-${style}`] = [
		{ path: `assets/fonts/SourceCodePro-${style}.ttf`, weight: wght },
	]
}

export default plugin({
	preInit({ themes }) {
		themes.registerGroup('dead1nsane', {
			name: 'DEAD1nsane',
			description: 'Fonts by Rairof',
		})

		themes.registerFontPack('dead1nsane', 'source-code-pro', {
			name: 'Source Code Pro',
			description: 'Monospace font for code editors.',
			families: fontFamilies,
		})
	},
})