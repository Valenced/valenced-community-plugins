const FAMILIES = [
	'he him his himself',
	'she her hers herself',
	'they them their theirs themself themselves',
	'it its itself',
	"one one's oneself",
	'xe xem xyr xyrs xemself xir xirs xirself xey',
	'ze zir zirs zirself zie zim zem zes hir hirs hirself',
	'fae faer faers faerself',
	'ey em eir eirs emself e ems',
	've ver vis verself vir',
	'ne nem nir nirs nemself nym',
	'per pers perself',
	'thon thons thonself',
	'ae aer aers aerself',
	'co cos coself',
	'hu hum hus huself',
	'ki kin kis kinself',
	'sie hir hirs',
	'shi hir hirs hiz',
	'vae vaer vaers vaerself',
	'lu lum lus luself',
	'yo yos yoself',
	'te tem ter temself',
	'di dem dir demself',
	'ya yam yamself',
	'ix ixs ixself',
].map(family => family.split(' '))

// Also everyday words or parts of names ("Emperor Shi Hao"), so they only count in a slash set
const AMBIGUOUS = new Set(
	(
		"his her their it its one one's e em ems ey ve ver vis vir ne nym per pers thon thons ae co " +
		'cos hu hum hus ki kin kis sie shi hiz zes zem zim vae lu lum lus yo yos te tem ter ' +
		'di dem dir ya yam ix ixs xir nir aer'
	).split(' '),
)

const ANY_ALL = ['any', 'all', 'anything', 'everything']
const NEUTRAL = new Set(['pronouns', 'pronoun', 'prns', 'prn'])
const CONNECTORS = new Set(['and', 'or'])
const STANDARD_FAMILIES = new Set([0, 1, 2, 3])
const SLASHES = /[\\∕⁄／⧸]/g
const PARTS = /[,|;•·+&\n()[\]{}<>]+|\s+but\s+/i
const WORD = /[\p{L}']+/gu

export interface ValidateOptions {
	anyAll: boolean
}

const familyOf = new Map<string, Set<number>>()
FAMILIES.forEach((family, index) => {
	for (const word of family) {
		const set = familyOf.get(word) ?? new Set<number>()
		set.add(index)
		familyOf.set(word, set)
	}
})

const KNOWN = new Set<string>([...familyOf.keys(), ...ANY_ALL])

function known(word: string, options: ValidateOptions) {
	return KNOWN.has(word) && (options.anyAll || !ANY_ALL.includes(word))
}

function distinct(word: string) {
	return familyOf.has(word) && !AMBIGUOUS.has(word)
}

function standard(word: string): boolean {
	for (const index of familyOf.get(word) ?? [])
		if (STANDARD_FAMILIES.has(index)) return true
	return false
}

function oneFamily(words: string[]): boolean {
	let shared: Set<number> | undefined
	for (const word of words) {
		const families = familyOf.get(word)
		if (!families) return false
		shared = shared
			? new Set([...shared].filter(index => families.has(index)))
			: new Set(families)
		if (!shared.size) return false
	}
	return true
}

interface Run {
	shown: string[]
	lower: string[]
	slashed: boolean
}

// Keeps only the pronoun sets of a free-text field: `he/him 🌈 | 19` gives `he/him`
export function cleanPronouns(
	text: string,
	options: ValidateOptions,
): string | undefined {
	const sets: string[] = []
	for (const part of String(text ?? '')
		.replace(SLASHES, '/')
		.split(PARTS)) {
		const runs: Run[] = []
		let current: Run = { shown: [], lower: [], slashed: false }
		let prose = false
		let lastEnd = -1
		const flush = () => {
			if (current.shown.length) runs.push(current)
			current = { shown: [], lower: [], slashed: false }
		}
		for (const match of part.matchAll(WORD)) {
			const raw = match[0]
			const start = match.index ?? 0
			const between = lastEnd >= 0 ? part.slice(lastEnd, start) : ''
			lastEnd = start + raw.length
			const shown = raw.replace(/^'+|'+$/g, '')
			const word = shown.toLowerCase()
			if (!word || NEUTRAL.has(word)) continue
			if (CONNECTORS.has(word)) {
				flush()
				continue
			}
			if (!options.anyAll && ANY_ALL.includes(word)) continue
			if (!known(word, options)) {
				prose = true
				flush()
				continue
			}
			const joined = between.includes('/')
			if (
				current.shown.length >= 5 ||
				(current.shown.length &&
					current.slashed !== joined &&
					current.shown.length > 1)
			)
				flush()
			if (joined && current.shown.length) current.slashed = true
			current.shown.push(shown)
			current.lower.push(word)
		}
		flush()
		for (const run of runs) {
			const hasDistinct = run.lower.some(distinct)
			const keep = run.slashed
				? hasDistinct || oneFamily(run.lower) || run.lower.some(standard)
				: !prose && hasDistinct
			if (keep) sets.push(run.shown.join('/'))
		}
	}
	const seen = new Set<string>()
	const unique = sets.filter(
		set => !seen.has(set.toLowerCase()) && seen.add(set.toLowerCase()),
	)
	return unique.length ? unique.join(', ') : undefined
}

// Characters that draw as blank space, including the Hangul filler `ㅤ` used for "invisible" text
const BLANK = '\\s\\u115F\\u1160\\u17B4\\u17B5\\u2800\\u3164\\uFFA0'
const ZERO =
	'\\u00AD\\u034F\\u061C\\u180E\\u200B\\u200C\\u200E\\u200F\\u202A-\\u202E\\u2060-\\u2064\\u2066-\\u206F\\uFEFF'
const BLANK_RUN = new RegExp(`[${ZERO}]*[${BLANK}][${BLANK}${ZERO}]*`, 'gu')
const EDGES = new RegExp(`^[ ${ZERO}]+|[ ${ZERO}]+$`, 'gu')
const GLUE = new RegExp(`[${ZERO}\\u200D\\uFE00-\\uFE0F]`, 'gu')

export function tidy(text: unknown): string | undefined {
	if (typeof text !== 'string') return undefined
	const tidied = text.replace(BLANK_RUN, ' ').replace(EDGES, '')
	return tidied.replace(GLUE, '') ? tidied : undefined
}

const PRONOUNDB_NOT_PRONOUNS = new Set(['ask', 'avoid', 'other'])

export function cleanPronounDb(
	text: string,
	options: ValidateOptions,
): string | undefined {
	const kept = String(text ?? '')
		.split('/')
		.map(code => code.trim())
		.filter(code => code && !PRONOUNDB_NOT_PRONOUNS.has(code.toLowerCase()))
		.filter(code => options.anyAll || !ANY_ALL.includes(code.toLowerCase()))
	return kept.length ? kept.join('/') : undefined
}
