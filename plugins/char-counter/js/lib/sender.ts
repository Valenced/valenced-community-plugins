/**
 * Sending a long message as several, with a wait between them.
 *
 * `sendMessage` is where every route into the outbox ends (the button, the return key, the share
 * sheet), so that is what is patched, with the patcher's `instead`. Whatever else hooks
 * `sendMessage` keeps working: a hook outside ours sees the whole text, one inside ours sees each
 * part.
 *
 * ## Discord refuses first, unless the limit it checks is raised
 *
 * Pressing send runs `chatInputHandleSendText` -> `chatInputValidateContentLength`, which calls
 * `getMaxMessageLength()` (module `useMessageMaxLength` / `getMaxMessageLength`, 351.3; found by
 * tracing the call on the device) and refuses over-limit text before `sendMessage` is ever
 * reached. So while splitting is on, that export is patched to report `limit x max parts`; the
 * real function is handed to `lib/length.ts`, which is where this plugin takes its cut from. Text
 * beyond even the raised limit still reaches `sendMessage`, is sent as typed, and Discord's server
 * says it is too long -- as the settings page says.
 *
 * A message within the limit goes straight through, on the same tick, untouched. Past it, the text
 * is cut (`lib/split.ts`); the first part goes out through the original call with everything the
 * message carried (reply, attachments, allowed mentions), and the rest follow as plain text
 * messages, each after the wait -- the setting, or the channel's slowmode when that is longer.
 * Parts go out in order: each one waits for the previous send to settle first.
 *
 * If a later part fails, whatever has not been sent goes back into the message box (Discord's own
 * `saveDraft`, else a `DRAFT_CHANGE` dispatch) and a toast says so, since by then the box is empty
 * and the caller has long had its answer. The hook itself never throws: any failure in the
 * planning sends the message exactly as typed.
 */

import { ToastActionCreators } from '@valenced/discord/actions'
import { Dispatcher } from '@valenced/discord/common/flux'
import { Stores } from '@valenced/discord/flux'
import { getModules, lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { SPLIT_DELAY, SPLIT_MAX } from '../index'
import { limit, maxLengthHostOf, setRealLimit } from './length'
import { reportError } from './report'
import { splitMessage } from './split'
import type { DiscordModules } from '@valenced/discord/types'
import type { PluginCleanupApi } from '@valenced/plugins/types'
import type { CharCounterStorage } from '../index'
import type { MaxLengthModule } from './length'

const TAG = '[CharCounter]'
/** Discord's DraftType.ChannelMessage. */
const CHANNEL_MESSAGE = 0

/** What the chat input hands `sendMessage`; only `content` is read or changed here. */
interface OutgoingMessage {
	content: string
	tts?: boolean
	invalidEmojis?: unknown[]
	validNonShortcutEmojis?: unknown[]
}

type SendArgs = [
	channelId: string,
	message: OutgoingMessage,
	...rest: unknown[],
]

/** The message action creators; the three names together match only that module. */
interface MessageActions {
	sendMessage(...args: SendArgs): unknown
	editMessage: unknown
	startEditMessage: unknown
}

interface DraftActions {
	saveDraft?(channelId: string, draftType: number, draft: string): void
	clearDraft?: unknown
	default?: {
		saveDraft?(channelId: string, draftType: number, draft: string): void
	}
}

type ChannelStore = DiscordModules.Flux.Store<{
	getChannel(id: string): { rateLimitPerUser?: number } | undefined
}>

/** The wait between parts, in seconds, clamped and on the slider's half-second steps. */
export function delaySecondsOf(s: Partial<CharCounterStorage>): number {
	const value = Number(s.splitDelaySec)
	if (!Number.isFinite(value)) return SPLIT_DELAY.default
	return Math.min(
		SPLIT_DELAY.max,
		Math.max(
			SPLIT_DELAY.min,
			Math.round(value / SPLIT_DELAY.step) * SPLIT_DELAY.step,
		),
	)
}

/** The most parts a message may be split into, clamped. */
export function maxPartsOf(s: Partial<CharCounterStorage>): number {
	const value = Number(s.splitMax)
	return Number.isFinite(value)
		? Math.min(SPLIT_MAX.max, Math.max(SPLIT_MAX.min, Math.round(value)))
		: SPLIT_MAX.default
}

interface Plan {
	channelId: string
	message: OutgoingMessage
	parts: string[]
	delayMs: number
}

export function patchSplit(
	cleanup: PluginCleanupApi,
	settings: () => CharCounterStorage,
): void {
	patchLimit(cleanup, settings)
	patchSend(cleanup, settings)
}

/**
 * Patches `getMaxMessageLength` so Discord's own send validation allows `limit x max parts` while
 * splitting is on. The hook export (`default`, `useMessageMaxLength`) is left alone: it was not on
 * the send path when traced, and Discord's counter drawing is dropped by `lib/counter.tsx` anyway.
 * One module defines the function (checked in the 352.2 bundle), so `getModules` is enough.
 */
function patchLimit(
	cleanup: PluginCleanupApi,
	settings: () => CharCounterStorage,
): void {
	cleanup(
		getModules(withProps<MaxLengthModule>('getMaxMessageLength'), exports => {
			const host = maxLengthHostOf(exports)
			if (!host) {
				reportError(
					`${TAG} getMaxMessageLength is not a function on the module found`,
				)
				return
			}
			// The real limit, captured before the patch so `lib/length.ts` cuts at Discord's number.
			const real = host.getMaxMessageLength.bind(host)
			setRealLimit(real)
			cleanup(
				() => setRealLimit(undefined),
				instead(host, 'getMaxMessageLength', function (args, original) {
					const value = Reflect.apply(original, this, args)
					if (typeof value !== 'number') return value
					const s = settings()
					return s.split ? value * maxPartsOf(s) : value
				}),
			)
		}),
	)
}

function patchSend(
	cleanup: PluginCleanupApi,
	settings: () => CharCounterStorage,
): void {
	cleanup(
		getModules(
			withProps<MessageActions>(
				'sendMessage',
				'editMessage',
				'startEditMessage',
			),
			actions => {
				if (typeof actions.sendMessage !== 'function') {
					reportError(
						`${TAG} sendMessage is not a function on the module found`,
					)
					return
				}
				cleanup(
					instead(actions, 'sendMessage', function (args, original) {
						try {
							const plan = planSplit(args, settings())
							if (plan) return sendParts.call(this, original, args, plan)
						} catch (error) {
							// Never stand between the user and the send: it goes ahead exactly as typed.
							reportError(`${TAG} splitting failed; sending as typed:`, error)
						}
						return Reflect.apply(original, this, args)
					}),
				)
			},
		),
	)
}

/** The parts and the wait, or undefined when this send is to go out as it is. */
function planSplit(args: SendArgs, s: CharCounterStorage): Plan | undefined {
	if (!s.split) return undefined
	const [channelId, message] = args
	const content = message?.content
	if (typeof channelId !== 'string' || typeof content !== 'string')
		return undefined
	const max = limit()
	if (content.length <= max) return undefined

	const parts = splitMessage(content, max)
	if (parts.length <= 1) return undefined
	if (parts.length > maxPartsOf(s)) {
		// Sent as typed: Discord then says it is too long, as it would without this plugin.
		showToast(
			`That's ${parts.length} messages' worth; the most it splits into is ${maxPartsOf(s)}`,
		)
		return undefined
	}
	return {
		channelId,
		message,
		parts,
		delayMs: Math.max(delaySecondsOf(s), slowmodeSeconds(channelId)) * 1000,
	}
}

function sendParts(
	this: unknown,
	original: MessageActions['sendMessage'],
	args: SendArgs,
	plan: Plan,
) {
	const { channelId, message, parts, delayMs } = plan
	// The first part carries everything the message had: the reply, attachments, allowed mentions.
	const first = Reflect.apply(original, this, [
		channelId,
		{ ...message, content: parts[0] },
		...args.slice(2),
	])
	showToast(`Sending as ${parts.length} messages`)
	void (async () => {
		let sent = 0
		try {
			await settle(first)
			sent = 1
			for (const part of parts.slice(1)) {
				await sleep(delayMs)
				// Plain text, the shape Discord's own follow-up sends use.
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
			reportError(`${TAG} part ${sent + 1} of ${parts.length} failed:`, error)
			const left = parts.slice(Math.max(sent, 1)).join('\n\n')
			if (left) {
				restoreDraft(channelId, left)
				showToast(
					`Part ${sent + 1} of ${parts.length} didn't send. The rest is back in the message box.`,
				)
			}
		}
	})()
	return first
}

/** Discord's toast, `open(key, { text })` from 350.4 on (the manifest requires that). */
function showToast(text: string) {
	try {
		ToastActionCreators.open('CharCounterToast', { text })
	} catch {
		/* a missing toast must never take the app down */
	}
}

/** Waits for a send's result; a rejected promise or an `ok: false` reply counts as a failure. */
async function settle(result: unknown): Promise<void> {
	const value = result instanceof Promise ? await result : result
	if (
		value &&
		typeof value === 'object' &&
		(value as { ok?: boolean }).ok === false
	)
		throw new Error(`HTTP ${(value as { status?: number }).status ?? '?'}`)
}

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)))
}

/** The channel's slowmode in seconds, or 0. */
function slowmodeSeconds(channelId: string): number {
	try {
		const seconds = (Stores.ChannelStore as ChannelStore).getChannel(
			channelId,
		)?.rateLimitPerUser
		return typeof seconds === 'number' && seconds > 0 ? seconds : 0
	} catch {
		return 0
	}
}

let saveDraft: DraftActions['saveDraft']
let draftLooked = false

/** Puts `content` back in the channel's message box: `saveDraft`, else a `DRAFT_CHANGE` dispatch. */
function restoreDraft(channelId: string, content: string) {
	try {
		if (!draftLooked) {
			draftLooked = true
			const [exports] = lookupModule(
				withProps<DraftActions>('saveDraft', 'clearDraft'),
			)
			// The export is usually on `default`, not on the namespace -- coding rule 3.
			const host =
				typeof exports?.saveDraft === 'function' ? exports : exports?.default
			saveDraft = host?.saveDraft?.bind(host)
		}
		if (saveDraft) {
			saveDraft(channelId, CHANNEL_MESSAGE, content)
			return
		}
	} catch {
		/* fall through to the dispatch */
	}
	try {
		Dispatcher.dispatch({
			type: 'DRAFT_CHANGE',
			channelId,
			draftType: CHANNEL_MESSAGE,
			draft: content,
		})
	} catch (error) {
		reportError(`${TAG} could not put the unsent text back:`, error)
	}
}
