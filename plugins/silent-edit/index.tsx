import TableRowAssetIcon from '@valenced/components/TableRowAssetIcon'
import {
	ActionSheetActionCreators,
	ToastActionCreators,
} from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { before, instead } from '@valenced/patcher'
import SettingsComponent from './settings'
import { DefaultSettings } from './shared'
import type { DiscordModules } from '@valenced/discord/types'
import type { JsonStorage } from '@valenced/json-storage'
import type { AnyFunction } from '@valenced/utils/types'
import type { ReactElement } from 'react'
import type { Settings } from './shared'

const { TableRow } = Design

type Attachment = {
	id: string
	filename: string
	uploaded_filename?: string
}

type Message = {
	id: string
	author?: { id: string }
	flags?: number
	attachments?: Attachment[]
	mentions?: { id: string }[]
	message_reference?: {
		message_id: string
		channel_id: string
		guild_id?: string
	}
	referenced_message?: { author?: { id: string } }
}

type MessageEdit = {
	content?: string
	attachments?: Attachment[]
}

type EditActions = {
	editMessage(channelId: string, messageId: string, edit: MessageEdit): unknown
	startEditMessage(...args: unknown[]): unknown
}

type SheetProps = {
	message?: Message
}

type SheetModule = { default: AnyFunction }

type Request = { url: string; body?: Record<string, unknown> }
type Response = { hasErr: boolean; status: number; body?: unknown }
type HTTP = {
	post(request: Request, callback: (response: Response) => void): void
	del(request: Request, callback: (response: Response) => void): void
}

type UserStore = DiscordModules.Flux.Store<{
	getCurrentUser(): { id: string } | undefined
}>

type MessageStore = DiscordModules.Flux.Store<{
	getMessage(channelId: string, messageId: string): Message | undefined
}>

let storage: JsonStorage<Settings>
let pendingSilentEditMessageId: string | null = null
let http: HTTP | undefined

const FILENAME_RE = /\.filename\s+(\S+)/g
const EDIT_ROW_RE = /edit|bearbeit/

function labelOf(row: unknown): string {
	if (typeof row !== 'object' || row === null || !('props' in row)) return ''
	const label = (row as { props?: { label?: unknown } }).props?.label
	return typeof label === 'string' ? label.toLowerCase() : ''
}

function keyOf(row: unknown): unknown {
	if (typeof row !== 'object' || row === null) return undefined
	return (row as { key?: unknown }).key
}

function onPressOf(row: unknown): (() => void) | undefined {
	if (typeof row !== 'object' || row === null || !('props' in row)) return
	const onPress = (row as { props?: { onPress?: unknown } }).props?.onPress
	return typeof onPress === 'function' ? (onPress as () => void) : undefined
}

function collectChildren(
	node: unknown,
	lists: Array<Array<unknown>> = [],
): Array<Array<unknown>> {
	if (Array.isArray(node)) {
		if (node.some(row => EDIT_ROW_RE.test(labelOf(row)))) lists.push(node)
		for (const child of node) collectChildren(child, lists)
	} else if (typeof node === 'object' && node !== null) {
		collectChildren(
			(node as { props?: { children?: unknown } }).props?.children,
			lists,
		)
	}
	return lists
}

function injectRow(tree: ReactElement, props: SheetProps) {
	if (storage.cache?.overrideNative ?? DefaultSettings.overrideNative) return
	const message = props.message
	if (!message) return
	const currentUser = (
		Stores.UserStore as UserStore | undefined
	)?.getCurrentUser()
	if (!currentUser || message.author?.id !== currentUser.id) return

	for (const children of collectChildren(tree)) {
		const silentIndex = children.findIndex(row => keyOf(row) === 'silent-edit')
		if (silentIndex !== -1) children.splice(silentIndex, 1)

		const editIndex = children.findIndex(row => EDIT_ROW_RE.test(labelOf(row)))
		if (editIndex === -1) continue
		const editMessage = onPressOf(children[editIndex])
		if (!editMessage) continue

		children.splice(
			editIndex + 1,
			0,
			<TableRow
				key="silent-edit"
				label="Silent Edit"
				icon={<TableRowAssetIcon name="PencilIcon" />}
				onPress={() => {
					pendingSilentEditMessageId = message.id
					editMessage()
				}}
			/>,
		)
		break
	}
}

function errorText(error: unknown): string {
	if (typeof error === 'object' && error !== null) {
		const body = (error as { body?: { message?: unknown } }).body
		if (body && typeof body.message === 'string') return body.message
		const text = (error as { message?: unknown }).message
		if (typeof text === 'string') return text
	}
	return String(error)
}

function request(method: 'post' | 'del', data: Request): Promise<Response> {
	return new Promise((resolve, reject) => {
		if (!http) {
			reject(new Error('HTTP client is unavailable.'))
			return
		}
		http[method](data, response => {
			if (response.hasErr || response.status < 200 || response.status >= 300) {
				reject(response)
			} else resolve(response)
		})
	})
}

async function silentEdit(
	channelId: string,
	messageId: string,
	edit: MessageEdit,
	message: Message,
): Promise<Response> {
	let content = edit.content ?? ''
	let attachments: Attachment[] | undefined

	const matches = [...content.matchAll(FILENAME_RE)]
	if (matches.length > 0) {
		attachments = matches.slice(0, 10).map((match, index) => {
			const uploaded = match[1]
			return {
				id: String(index),
				filename: uploaded.split('/').pop() || 'image.png',
				uploaded_filename: uploaded,
			}
		})
		content = content.replace(FILENAME_RE, '').trim()
	} else {
		attachments = edit.attachments ?? message.attachments
	}

	const body: Record<string, unknown> = {
		content,
		nonce: messageId,
		tts: false,
		flags: message.flags ?? 0,
		mobile_network_type: 'wifi',
	}
	if (attachments) body.attachments = attachments

	if (message.message_reference) {
		body.message_reference = {
			message_id: message.message_reference.message_id,
			channel_id: message.message_reference.channel_id,
			guild_id: message.message_reference.guild_id,
		}
		const repliedUser = message.referenced_message?.author?.id
		const hasPing = repliedUser
			? (message.mentions?.some(user => user.id === repliedUser) ?? false)
			: false
		body.allowed_mentions = {
			replied_user: hasPing,
			parse: ['users', 'roles', 'everyone'],
		}
	}

	const response = await request('post', {
		url: `/channels/${channelId}/messages`,
		body,
	})
	await request('del', {
		url: `/channels/${channelId}/messages/${messageId}`,
	})
	return response
}

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: {
		load: true,
		default: DefaultSettings,
	},
	start({ cleanup, jsonStorage }) {
		storage = jsonStorage

		cleanup(
			getModules(
				withProps<{ HTTP: HTTP }>('HTTP'),
				({ HTTP: client }) => {
					http = client
				},
				{ max: 1 },
			),
		)

		cleanup(
			getModules(
				withProps<EditActions>('editMessage', 'startEditMessage'),
				actions => {
					cleanup(
						instead(actions, 'editMessage', async function (args, original) {
							const [channelId, messageId, edit] = args
							if (
								!(
									storage.cache?.overrideNative ??
									DefaultSettings.overrideNative
								) &&
								pendingSilentEditMessageId !== messageId
							) {
								return Reflect.apply(original, this, args)
							}
							pendingSilentEditMessageId = null

							const messageStore = Stores.MessageStore as
								| MessageStore
								| undefined
							const message = messageStore?.getMessage(channelId, messageId)
							if (!message) {
								return Reflect.apply(original, this, args)
							}

							try {
								return await silentEdit(channelId, messageId, edit, message)
							} catch (error) {
								ToastActionCreators.open('SILENT_EDIT_ERROR', {
									text: `Error: ${errorText(error)}`,
									variant: 'critical',
								})
								return Reflect.apply(original, this, args)
							}
						}),
					)
				},
				{ max: 1 },
			),
		)

		const patchedSheets = new WeakSet<object>()

		cleanup(
			before(ActionSheetActionCreators, 'openLazy', args => {
				const [sheet, key] = args
				if (
					key === 'MessageLongPressActionSheet' &&
					typeof sheet?.then === 'function'
				) {
					void sheet.then(instance => {
						const module = instance as SheetModule
						if (
							typeof module?.default !== 'function' ||
							patchedSheets.has(module)
						) {
							return
						}
						patchedSheets.add(module)
						cleanup(
							instead(module, 'default', function (args, original) {
								const tree = Reflect.apply(original, this, args) as ReactElement
								if (tree) injectRow(tree, args[0] as SheetProps)
								return tree
							}),
						)
					})
				}
				return args
			}),
		)
	},
	SettingsComponent,
})
