import { ToastActionCreators } from '@valenced/discord/actions'
import { Stores } from '@valenced/discord/flux'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { sleep } from '@valenced/utils/promise'
import SettingsComponent from './settings'
import { DefaultSettings } from './shared'
import type { DiscordModules } from '@valenced/discord/types'
import type { Settings } from './shared'

let slowmodeUtils: SlowmodeUtils | undefined
let stopped = false

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: {
		load: true,
		default: DefaultSettings,
	},
	start({ cleanup, jsonStorage, plugin }) {
		stopped = false

		cleanup(
			() => {
				stopped = true
			},
			getModules(withProps<SlowmodeUtils>('canBypassSlowmode'), mod => {
				slowmodeUtils = mod
			}),
			getModules(
				withProps<{ getMaxMessageLength(): number }>('getMaxMessageLength'),
				mod => {
					cleanup(
						instead(mod, 'getMaxMessageLength', (_, orig) => {
							const stack = new Error().stack
							return stack?.includes('chatInputValidateContentLength') ||
								stack?.includes('chatInputCreateThread')
								? 2 ** 30
								: orig()
						}),
					)
				},
			),
			getModules(
				withProps<MessageActions>('sendMessage', 'editMessage'),
				actions => {
					cleanup(
						instead(actions, 'sendMessage', async (args, orig) => {
							const [channelId, message] = args
							const content = message?.content
							const limit = getLimit()

							if (typeof content !== 'string' || content.length <= limit) {
								return orig(...args)
							}

							const chunks = splitMessage(
								content,
								limit,
								jsonStorage.cache?.splitOnWords,
							)
							if (chunks.length <= 1) return orig(...args)

							message.content = chunks[0]
							const result = await orig(...args)
							sendChunks(
								actions,
								channelId,
								chunks.slice(1),
								message,
								plugin.reportError,
							)

							return result
						}),
						instead(actions, 'editMessage', (args, orig) => {
							const [, , message] = args
							const content = message?.content
							const limit = getLimit()

							if (typeof content !== 'string' || content.length <= limit) {
								return orig(...args)
							}

							ToastActionCreators.open('SPLIT_MESSAGES_EDIT_TOO_LONG', {
								text: `Message exceeds the ${limit} character limit.`,
								variant: 'critical',
							})
							return Promise.resolve()
						}),
					)
				},
			),
		)
	},
	SettingsComponent,
})

function getLimit(): number {
	return (Stores.UserStore as UserStore)?.getCurrentUser()?.premiumType === 2
		? 4000
		: 2000
}

async function waitCooldown(channelId: string) {
	const channel = (Stores.ChannelStore as ChannelStore)?.getChannel(channelId)
	const rateLimit = channel?.rateLimitPerUser ?? 0
	const canBypass = slowmodeUtils?.canBypassSlowmode(channel) ?? false

	if (rateLimit <= 0 || canBypass) {
		await sleep(500)
		return
	}

	await sleep(rateLimit * 1000 + 250)
}

async function sendChunks(
	actions: MessageActions,
	channelId: string,
	chunks: string[],
	template: MessagePayload,
	reportError: (e: unknown) => void,
) {
	for (let i = 0; i < chunks.length; i++) {
		if (stopped) break
		await waitCooldown(channelId)
		if (stopped) break

		try {
			await actions._sendMessage(
				channelId,
				{
					content: chunks[i],
					invalidEmojis: template.invalidEmojis ?? [],
					validNonShortcutEmojis: template.validNonShortcutEmojis ?? [],
					tts: false,
				},
				{},
			)
		} catch (error) {
			reportError(error)
			ToastActionCreators.open('SPLIT_MESSAGES_SEND_FAILED', {
				text: `Failed to send part ${i + 2}/${chunks.length + 1}.`,
				variant: 'critical',
			})
			break
		}
	}
}

function splitMessage(
	content: string,
	maxLength: number,
	splitOnWords = false,
): string[] {
	if (content.length <= maxLength) return [content]

	const sep = splitOnWords && !content.includes('```') ? ' ' : '\n'
	const items = content.split(sep)
	const chunks: string[] = []

	let current = ''
	let inCode = false
	let lang = ''

	for (const item of items) {
		const trimmed = item.trimStart()
		const tag = trimmed.slice(3).trim()
		const isFence = trimmed.startsWith('```') && !tag.includes('```')
		const closesCode = isFence && inCode

		const open = inCode ? `\`\`\`${lang}\n` : ''
		const close = inCode && !closesCode ? '\n```' : ''
		const candidate = current ? `${current}${sep}${item}` : `${open}${item}`

		if (candidate.length + close.length > maxLength) {
			if (current) {
				chunks.push(`${current}${inCode ? '\n```' : ''}`)
				current = ''
			}

			if (closesCode) {
				inCode = false
				lang = ''
				continue
			}

			current = `${open}${item}`

			if (current.length + close.length > maxLength) {
				const limit = Math.max(maxLength - open.length - close.length, 50)
				current = splitLongLine(item, limit, open, close, chunks)
			}
		} else {
			current = candidate
		}

		if (isFence) {
			inCode = !inCode
			lang = inCode ? tag : ''
		}
	}

	if (current) {
		chunks.push(`${current}${inCode ? '\n```' : ''}`)
	}

	return chunks.map(c => c.trim()).filter(Boolean)
}

function splitLongLine(
	line: string,
	limit: number,
	open: string,
	close: string,
	chunks: string[],
): string {
	let lineChunk = ''

	for (const word of line.split(' ')) {
		const next = lineChunk ? `${lineChunk} ${word}` : word
		if (next.length <= limit) {
			lineChunk = next
			continue
		}

		if (lineChunk) {
			chunks.push(`${open}${lineChunk}${close}`)
			lineChunk = ''
		}

		if (word.length <= limit) {
			lineChunk = word
			continue
		}

		for (let j = 0; j < word.length; j += limit) {
			chunks.push(`${open}${word.slice(j, j + limit)}${close}`)
		}
	}

	return lineChunk ? `${open}${lineChunk}` : ''
}

interface MessagePayload {
	content: string
	invalidEmojis?: unknown[]
	validNonShortcutEmojis?: unknown[]
	tts?: boolean
}

interface MessageActions {
	sendMessage(
		channelId: string,
		message: MessagePayload,
		flag?: boolean,
		options?: Record<string, unknown>,
	): Promise<unknown>
	_sendMessage(
		channelId: string,
		message: MessagePayload,
		options: Record<string, unknown>,
	): Promise<unknown>
	editMessage(
		channelId: string,
		messageId: string,
		message: MessagePayload,
	): Promise<unknown>
}

interface SlowmodeUtils {
	canBypassSlowmode(channel: unknown): boolean
}

type UserStore = DiscordModules.Flux.Store<{
	getCurrentUser(): { premiumType?: number } | undefined
}>

type ChannelStore = DiscordModules.Flux.Store<{
	getChannel(id: string): { rateLimitPerUser?: number } | undefined
}>
