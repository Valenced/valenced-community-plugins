const CdnHost = /^https:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net|images-ext-\d+\.discordapp\.net)\//

const Floor = 1024

function numeric(value: string | undefined): number | undefined {
	if (value === undefined || value === '') return undefined
	const parsed = Number(value)
	return Number.isFinite(parsed) ? parsed : undefined
}

function scale(parts: string[]): string[] | undefined {
	const sizeIndex = parts.findIndex((part) => part.startsWith('size='))
	if (sizeIndex >= 0) {
		const current = numeric(parts[sizeIndex].slice(5))
		if (current === undefined || current >= Floor) return undefined
		const next = [...parts]
		next[sizeIndex] = `size=${Floor}`
		return next
	}

	const widthIndex = parts.findIndex((part) => part.startsWith('width='))
	const heightIndex = parts.findIndex((part) => part.startsWith('height='))
	const width = widthIndex >= 0 ? numeric(parts[widthIndex].slice(6)) : undefined
	const height = heightIndex >= 0 ? numeric(parts[heightIndex].slice(7)) : undefined

	const largest = Math.max(width ?? 0, height ?? 0)
	if (largest <= 0 || largest >= Floor) return undefined

	const factor = Floor / largest
	const next = [...parts]
	if (width !== undefined && widthIndex >= 0) {
		next[widthIndex] = `width=${Math.round(width * factor)}`
	}
	if (height !== undefined && heightIndex >= 0) {
		next[heightIndex] = `height=${Math.round(height * factor)}`
	}
	return next
}

export function rewriteUri(uri: string): string {
	if (!CdnHost.test(uri)) return uri

	const queryStart = uri.indexOf('?')
	if (queryStart < 0) return uri

	const base = uri.slice(0, queryStart)
	const parts = uri.slice(queryStart + 1).split('&')
	const scaled = scale(parts)
	if (!scaled) return uri

	return `${base}?${scaled.join('&')}`
}
