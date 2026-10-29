import { ToastActionCreators } from '@valenced/discord/actions'
import { Dispatcher } from '@valenced/discord/common/flux'
import { Stores } from '@valenced/discord/flux'
import { getModules, lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { after, instead } from '@valenced/patcher'
import { clamp, SplitDelay, SplitMax } from './shared'
import type { DiscordModules } from '@valenced/discord/types'
import type { PluginCleanupApi } from '@valenced/plugins/types'
import type { Settings } from './shared'

interface OutgoingMessage {
	content: string
	tts?: boolean
	invalidEmojis?: unknown[]
	validNonShortcutEmojis?: unknown[]
}

type SendArgs = [channelId: string, message: OutgoingMessage, ...unknown[]]

interface MessageActions {
	sendMessage(...args: SendArgs): unknown
	editMessage: unknown
	startEditMessage: unknown
}

interface MaxLength {
	getMaxMessageLength(): number
}

type SaveDraft = (channelId: string, draftType: number, draft: string) => void

interface DraftActions {
	saveDraft?: SaveDraft
	clearDraft?: unknown
	default?: { saveDraft?: SaveDraft }
}

type ChannelStore = DiscordModules.Flux.Store<{
	getChannel(id: string): { rateLimitPerUser?: number } | undefined
}>

interface Plan {
	parts: string[]
	delayMs: number
}

const ChannelMessageDraft = 0

let realLimit: (() => number) | undefined

export function limit(): number {
	const value = realLimit?.()
	return typeof value === 'number' && value > 0 ? value : 2000
}

export const maxParts = (s: Settings) => clamp(s.splitMax, SplitMax)
export const delaySeconds = (s: Settings) => clamp(s.splitDelaySec, SplitDelay)

export function estimateParts(length: number, max: number): number {
	return Math.max(1, Math.ceil(length / max))
}

export function patchSplit(
	cleanup: PluginCleanupApi,
	settings: () => Settings,
	report: (message: string, error?: unknown) => void,
) {
	cleanup(
		// Discord refuses over-limit text before sendMessage is reached, so the limit it checks is raised
		getModules(
			withProps<MaxLength & { default?: MaxLength }>('getMaxMessageLength'),
			exports => {
				const host =
					typeof exports.getMaxMessageLength === 'function'
						? exports
						: exports.default
				if (typeof host?.getMaxMessageLength !== 'function')
					return report('getMaxMessageLength not found')

				realLimit = host.getMaxMessageLength.bind(host)
				cleanup(
					() => {
						realLimit = undefined
					},
					after(host, 'getMaxMessageLength', value => {
						const s = settings()
						return s.split && typeof value === 'number'
							? value * maxParts(s)
							: value
					}),
				)
			},
		),
		getModules(
			withProps<MessageActions>(
				'sendMessage',
				'editMessage',
				'startEditMessage',
			),
			actions => {
				cleanup(
					instead(actions, 'sendMessage', function (args, original) {
						let plan: Plan | undefined
						try {
							plan = planParts(args, settings())
						} catch (error) {
							report('Splitting failed; sent as typed:', error)
						}
						return plan
							? sendParts.call(this, original, args, plan)
							: Reflect.apply(original, this, args)
					}),
				)
			},
		),
	)

	function planParts(
		[channelId, message]: SendArgs,
		s: Settings,
	): Plan | undefined {
		const content = message?.content
		if (!s.split || typeof content !== 'string') return
		const max = limit()
		if (content.length <= max) return

		const parts = splitMessage(content, max)
		if (parts.length <= 1) return
		if (parts.length > maxParts(s)) {
			showToast(
				`That's ${parts.length} messages' worth; the most it splits into is ${maxParts(s)}`,
			)
			return
		}

		const slowmode =
			(Stores.ChannelStore as ChannelStore).getChannel(channelId)
				?.rateLimitPerUser ?? 0
		return { parts, delayMs: Math.max(delaySeconds(s), slowmode) * 1000 }
	}

	function sendParts(
		this: unknown,
		original: MessageActions['sendMessage'],
		args: SendArgs,
		{ parts, delayMs }: Plan,
	) {
		const [channelId, message, ...rest] = args

		// The first part keeps the reply, attachments and allowed mentions
		const first = Reflect.apply(original, this, [
			channelId,
			{ ...message, content: parts[0] },
			...rest,
		])
		showToast(`Sending as ${parts.length} messages`)

		void (async () => {
			let sent = 0
			try {
				await settle(first)
				sent = 1
				for (const part of parts.slice(1)) {
					await new Promise(resolve => setTimeout(resolve, delayMs))
					await settle(
						Reflect.apply(original, this, [
							channelId,
							{
								content: part,
								tts: false,
								invalidEmojis: [],
								validNonShortcutEmojis: [],
							},
							undefined,
							{},
						]),
					)
					sent++
				}
			} catch (error) {
				report(`Part ${sent + 1} of ${parts.length} failed:`, error)
				try {
					restoreDraft(channelId, parts.slice(Math.max(sent, 1)).join('\n\n'))
				} catch (error) {
					report('Could not put the unsent text back:', error)
				}
				showToast(
					`Part ${sent + 1} of ${parts.length} didn't send. The rest is back in the message box.`,
				)
			}
		})()

		return first
	}
}

function showToast(text: string) {
	try {
		ToastActionCreators.open('CharCounterToast', { text })
	} catch {}
}

async function settle(result: unknown) {
	const value = (await result) as { ok?: boolean; status?: number } | undefined
	if (value?.ok === false) throw new Error(`HTTP ${value.status ?? '?'}`)
}

function restoreDraft(channelId: string, draft: string) {
	const [actions] = lookupModule(
		withProps<DraftActions>('saveDraft', 'clearDraft'),
	)
	const host = actions?.saveDraft ? actions : actions?.default
	if (host?.saveDraft) host.saveDraft(channelId, ChannelMessageDraft, draft)
	else
		Dispatcher.dispatch({
			type: 'DRAFT_CHANGE',
			channelId,
			draftType: ChannelMessageDraft,
			draft,
		})
}

// Best first: a blank line, a line break, the end of a sentence, any space
const Boundaries = [/\n[ \t]*\n/g, /\n/g, /[.!?…]["')\]]*[ \t]+/g, /\s+/g]
const Fence = '```'

export function splitMessage(text: string, max: number): string[] {
	const parts: string[] = []
	let rest = text
	let passes = 0
	while (rest.length > max && passes++ < 10_000) {
		let cut = findCut(rest, max)
		if (openFence(rest.slice(0, cut)) !== undefined) {
			// Close the code block in this part and reopen it in the next
			cut = findCut(rest, max - Fence.length - 1)
			const language = openFence(rest.slice(0, cut))
			if (language !== undefined) {
				parts.push(`${rest.slice(0, cut).replace(/\n+$/, '')}\n${Fence}`)
				rest = `${Fence}${language}\n${rest.slice(cut).replace(/^\n+/, '')}`
				continue
			}
		}
		parts.push(rest.slice(0, cut).replace(/\s+$/, ''))
		rest = rest.slice(cut).replace(/^\s+/, '')
	}
	if (rest) parts.push(rest)
	return parts.filter(part => part.length > 0)
}

function findCut(text: string, budget: number): number {
	if (budget < 1) return 1
	const window = text.slice(0, budget + 1)
	const floor = Math.floor(budget / 2)
	for (const boundary of Boundaries) {
		let best = -1
		for (const match of window.matchAll(boundary)) {
			const end = match.index + match[0].length
			if (end <= budget && end >= floor) best = end
		}
		if (best > 0) return best
	}
	// Don't cut a surrogate pair in half
	const code = text.charCodeAt(budget - 1)
	return code >= 0xd800 && code <= 0xdbff && budget > 1 ? budget - 1 : budget
}

function openFence(chunk: string): string | undefined {
	let open: string | undefined
	for (const match of chunk.matchAll(/```([^\s`]*)/g))
		open = open === undefined ? match[1] : undefined
	return open
}
