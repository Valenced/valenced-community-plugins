import { ToastActionCreators } from '@valenced/discord/actions'
import { Constants } from '@valenced/discord/common/constants'
import { Dispatcher } from '@valenced/discord/common/flux'
import {
	getStore,
	onFluxEventDispatched,
	withStoreName,
} from '@valenced/discord/flux'
import { getModules, lookupModule } from '@valenced/modules/finders'
import { withName, withProps } from '@valenced/modules/finders/filters'
import { after, instead } from '@valenced/patcher'
import {
	resolveCreateUploaderAttachments,
	resolveExistingUploadModule,
	uploadAttachments,
} from './upload'
import type { DiscordModules } from '@valenced/discord/types'
import type {
	AttachmentPayload,
	CreateUploaderAttachmentsFn,
	RowAttachment,
	Upload,
	Uploader,
	UploaderFile,
} from './upload'

const ATTACHMENT_FLAG_IS_SPOILER = 8
const EXISTING_UPLOAD_PREFIX = 'existing:'

type ExistingAttachment = {
	id: string
	filename: string
	description?: string | null
	content_type?: string
	url?: string
	proxy_url?: string
	width?: number
	height?: number
	flags?: number
}

type MessageRecord = {
	id: string
	content: string
	attachments?: ExistingAttachment[]
}

type EditSession = {
	messageId: string
	stashedDraftUploads: Upload[]
	initialAttachments: ExistingAttachment[]
}

type KeptExistingAttachment = {
	orig: ExistingAttachment
	upload: Upload
}

type PendingEdit = {
	channelId: string
	keptExisting: KeptExistingAttachment[]
	newFiles: Upload[]
}

type ActiveEditUpload = {
	channelId: string
	uploadKey: string
	keptIds: Set<string>
	uploaderId?: string
	uploader?: Uploader
	file?: UploaderFile
}

type MessageRowData = {
	changeType?: number
	message?: {
		id?: string
		attachments?: RowAttachment[]
		useAttachmentUploadPreview?: boolean
	}
}

type ChatEditInput = {
	handleSaveEditing(text: string): void
}

type ChatInputRefs = {
	chatInput?: {
		current?: Partial<ChatEditInput> | null
	}
	props?: {
		current?: {
			channel?: {
				id?: string
			}
		}
	}
}

function hasSaveEditing(input: Partial<ChatEditInput>): input is ChatEditInput {
	return typeof input.handleSaveEditing === 'function'
}

type EditActions = {
	editMessage(
		channelId: string,
		messageId: string,
		edit: { content: string },
	): Promise<void> | void
	startEditMessage: (
		channelId: string,
		messageId: string,
		content: string,
	) => void
	endEditMessage?(channelId: string): void
}

type Request = {
	url: string
	body?: {
		content?: string
		attachments?: AttachmentPayload[]
	}
}

type ResponseBody = {
	message?: string
	attachments?: ExistingAttachment[]
}

type Response = {
	hasErr: boolean
	status: number
	body?: ResponseBody
}

type HTTP = {
	patch(request: Request, callback: (response: Response) => void): void
}

type UploadPlatformModule = {
	UploadPlatform?: { REACT_NATIVE?: number }
}

type RowDataModule = {
	generateMessageRowData(row: MessageRowData): MessageRowData
}

type UploadAttachmentStore = {
	getUploads(channelId: string, draftType: number): Upload[]
}

type UploadStore = {
	getUploaderFileForMessageId(messageId: string): UploaderFile | undefined
}

type EditStore = {
	getEditingMessage(channelId: string): MessageRecord | undefined
	getEditingMessageId(channelId: string): string | undefined
}

type MessageStore = {
	getMessage(channelId: string, messageId: string): MessageRecord | undefined
}

type SelectedChannelStore = {
	getChannelId(): string | undefined
}

function getFluxStore<T>(
	name: string,
): DiscordModules.Flux.Store<T> | undefined {
	const [store] = lookupModule(withStoreName<T>(name))
	return store
}

function isSpoilerAttachment(attachment: ExistingAttachment): boolean {
	return (
		attachment.filename.startsWith('SPOILER_') ||
		Boolean((attachment.flags ?? 0) & ATTACHMENT_FLAG_IS_SPOILER)
	)
}

function createExistingUpload(
	attachment: ExistingAttachment,
): Upload | undefined {
	const uploadMod = resolveExistingUploadModule()
	if (!uploadMod || typeof uploadMod.default !== 'function') return undefined
	const [platformMod] = lookupModule(
		withProps<UploadPlatformModule>('UploadPlatform'),
	)
	const uri = attachment.proxy_url ?? attachment.url ?? ''
	const originalUri = attachment.url ?? attachment.proxy_url ?? ''
	const upload = new uploadMod.default({
		id: `${EXISTING_UPLOAD_PREFIX}${attachment.id}`,
		uri,
		originalUri,
		filename: attachment.filename,
		mimeType: attachment.content_type,
		width: attachment.width,
		height: attachment.height,
		platform: platformMod?.UploadPlatform?.REACT_NATIVE ?? 0,
		origin: uploadMod.UploadOrigin?.FILE_ATTACHMENT ?? 0,
	})
	upload.spoiler = isSpoilerAttachment(attachment)
	upload.description = attachment.description ?? null
	upload.status = 'COMPLETED'
	upload.removeFromMsgDraft = () => {}
	upload.cancel = () => {}
	upload.resetState = () => {}
	return upload
}

function isExistingAttachmentModified(
	orig: ExistingAttachment,
	upload: Upload,
): boolean {
	if (isSpoilerAttachment(orig) !== Boolean(upload.spoiler)) return true
	return (orig.description ?? null) !== (upload.description ?? null)
}

function serializeExistingAttachment(
	orig: ExistingAttachment,
	upload: Upload,
): AttachmentPayload {
	const hasSpoilerPrefix = orig.filename.startsWith('SPOILER_')
	const isSpoiler = Boolean(upload.spoiler)
	const filename =
		isSpoiler && !hasSpoilerPrefix
			? `SPOILER_${orig.filename}`
			: !isSpoiler && hasSpoilerPrefix
				? orig.filename.slice('SPOILER_'.length)
				: orig.filename
	const description = upload.description ?? orig.description
	return description !== undefined && description !== null
		? { id: orig.id, filename, description }
		: { id: orig.id, filename }
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message
	if (typeof error === 'object' && error !== null && 'reason' in error) {
		const reason = error.reason
		if (
			typeof reason === 'object' &&
			reason !== null &&
			'msg' in reason &&
			typeof reason.msg === 'string' &&
			reason.msg.length > 0
		)
			return reason.msg
	}
	return 'Could not add attachments.'
}

export default plugin({
	start({ cleanup, plugin }) {
		const pending = new Map<string, PendingEdit>()
		const editSessions = new Map<string, EditSession>()
		const existingAttachmentsMap = new WeakMap<Upload, ExistingAttachment>()
		const activeEditUploads = new Map<string, ActiveEditUpload>()
		const uploadKeyToMessageId = new Map<string, string>()
		const deletedAttachmentIds = new Set<string>()
		const savingChannels = new Set<string>()
		let editMessageInvokeCount = 0
		let uploadSeq = 0

		let uploadAttachmentStore:
			| DiscordModules.Flux.Store<UploadAttachmentStore>
			| undefined
		let uploadStore: DiscordModules.Flux.Store<UploadStore> | undefined
		let editStore: DiscordModules.Flux.Store<EditStore> | undefined
		let messageStore: DiscordModules.Flux.Store<MessageStore> | undefined
		let selectedChannelStore:
			| DiscordModules.Flux.Store<SelectedChannelStore>
			| undefined

		const getUploadAttachmentStore = () =>
			(uploadAttachmentStore ??= getFluxStore<UploadAttachmentStore>(
				'UploadAttachmentStore',
			))
		const getUploadStore = () =>
			(uploadStore ??= getFluxStore<UploadStore>('UploadStore'))
		const getEditStore = () =>
			(editStore ??= getFluxStore<EditStore>('EditMessageStore'))
		const getMessageStore = () =>
			(messageStore ??= getFluxStore<MessageStore>('MessageStore'))
		const getSelectedChannelStore = () =>
			(selectedChannelStore ??= getFluxStore<SelectedChannelStore>(
				'SelectedChannelStore',
			))

		const uploadsFor = (channelId: string) =>
			getUploadAttachmentStore()?.getUploads(channelId, 0) ?? []
		const setUploads = (channelId: string, uploads: Upload[]) =>
			Dispatcher.dispatch({
				type: 'UPLOAD_ATTACHMENT_SET_UPLOADS',
				channelId,
				draftType: 0,
				uploads,
			})
		const getEditingMessageRecord = (
			channelId: string,
		): MessageRecord | undefined => {
			const edits = getEditStore()
			const editingId = edits?.getEditingMessageId(channelId)
			if (!editingId) return undefined
			const direct = edits?.getEditingMessage(channelId)
			if (direct && direct.id === editingId) return direct
			return getMessageStore()?.getMessage(channelId, editingId)
		}
		const splitUploads = (channelId: string) => {
			const keptExisting: KeptExistingAttachment[] = []
			const newFiles: Upload[] = []
			for (const file of uploadsFor(channelId)) {
				const orig = existingAttachmentsMap.get(file)
				if (orig) keptExisting.push({ orig, upload: file })
				else newFiles.push(file)
			}
			return { keptExisting, newFiles }
		}
		const hasExistingModifications = (
			session: EditSession | undefined,
			keptExisting: KeptExistingAttachment[],
		) => {
			if (!session) return false
			if (keptExisting.length !== session.initialAttachments.length) return true
			return keptExisting.some(({ orig, upload }) =>
				isExistingAttachmentModified(orig, upload),
			)
		}
		const syncChannelEditState = (channelId: string) => {
			if (savingChannels.has(channelId)) return
			const message = getEditingMessageRecord(channelId)
			const session = editSessions.get(channelId)

			if (!message) {
				if (!session) return
				editSessions.delete(channelId)
				for (const file of uploadsFor(channelId)) {
					if (
						!existingAttachmentsMap.has(file) &&
						!session.stashedDraftUploads.includes(file)
					)
						file.cancel?.()
				}
				setUploads(channelId, session.stashedDraftUploads)
				return
			}

			if (session && session.messageId === message.id) return

			const stashedDraftUploads = session
				? session.stashedDraftUploads
				: uploadsFor(channelId).filter(
						file => !existingAttachmentsMap.has(file),
					)
			const initialAttachments = Array.isArray(message.attachments)
				? message.attachments.filter(att => !deletedAttachmentIds.has(att.id))
				: []
			const syntheticUploads: Upload[] = []
			for (const attachment of initialAttachments) {
				const upload = createExistingUpload(attachment)
				if (!upload) continue
				existingAttachmentsMap.set(upload, attachment)
				syntheticUploads.push(upload)
			}
			editSessions.set(channelId, {
				messageId: message.id,
				stashedDraftUploads,
				initialAttachments,
			})
			setUploads(channelId, syntheticUploads)
		}
		const syncAllEditingChannels = () => {
			const channelIds = new Set<string>(editSessions.keys())
			const selected = getSelectedChannelStore()?.getChannelId()
			if (selected) channelIds.add(selected)
			for (const channelId of channelIds) syncChannelEditState(channelId)
		}
		const clearUploadProgress = (messageId: string) => {
			const active = activeEditUploads.get(messageId)
			if (!active) return
			activeEditUploads.delete(messageId)
			uploadKeyToMessageId.delete(active.uploadKey)
			const file =
				active.file ??
				getUploadStore()?.getUploaderFileForMessageId(active.uploadKey)
			if (file)
				Dispatcher.dispatch({
					type: 'UPLOAD_COMPLETE',
					channelId: active.channelId,
					file,
					messageId: active.uploadKey,
				})
		}
		const restore = (url: string) => {
			const edit = pending.get(url)
			if (!edit) return
			pending.delete(url)
			if (!edit.newFiles.length) return
			const current = uploadsFor(edit.channelId)
			setUploads(edit.channelId, [
				...current,
				...edit.newFiles.filter(
					file => !current.some(queued => queued.id === file.id),
				),
			])
		}
		let stopped = false
		const listenerCleanups: (() => void)[] = []
		cleanup(() => {
			stopped = true
			for (const fn of listenerCleanups.splice(0)) fn()
			for (const messageId of Array.from(activeEditUploads.keys())) {
				activeEditUploads.get(messageId)?.uploader?.cancel?.()
				clearUploadProgress(messageId)
			}
			for (const [channelId, session] of editSessions)
				setUploads(channelId, session.stashedDraftUploads)
			editSessions.clear()
			for (const url of pending.keys()) restore(url)
		})
		const syncSafe = () => {
			try {
				syncAllEditingChannels()
			} catch (error) {
				plugin.reportError(error)
			}
		}
		cleanup(
			getStore<UploadAttachmentStore>('UploadAttachmentStore', store => {
				uploadAttachmentStore = store
			}),
			getStore<UploadStore>('UploadStore', store => {
				uploadStore = store
			}),
			getStore<MessageStore>('MessageStore', store => {
				messageStore = store
			}),
			getStore<EditStore>('EditMessageStore', store => {
				if (stopped) return
				editStore = store
				syncSafe()
				store.addChangeListener(syncSafe)
				listenerCleanups.push(() => store.removeChangeListener(syncSafe))
			}),
			getStore<SelectedChannelStore>('SelectedChannelStore', store => {
				if (stopped) return
				selectedChannelStore = store
				syncSafe()
				store.addChangeListener(syncSafe)
				listenerCleanups.push(() => store.removeChangeListener(syncSafe))
			}),
		)
		let createUploaderAttachmentsFn: CreateUploaderAttachmentsFn | undefined
		cleanup(
			onFluxEventDispatched<{
				file?: UploaderFile
				message?: { id?: string }
				uploader?: Uploader
			}>('UPLOAD_START', action => {
				const uploadKey = action.message?.id
				const messageId = uploadKey
					? uploadKeyToMessageId.get(uploadKey)
					: undefined
				const active = messageId ? activeEditUploads.get(messageId) : undefined
				if (active) {
					active.uploaderId = action.file?.id
					active.uploader = action.uploader
					active.file = action.file
				}
				return action
			}),
			onFluxEventDispatched<{
				messageId?: string
			}>('UPLOAD_FAIL', action => {
				if (action.messageId && uploadKeyToMessageId.has(action.messageId))
					return undefined
				return action
			}),
			onFluxEventDispatched<{
				uploaderId?: string
				file?: { id?: string }
				itemId?: string
			}>('UPLOAD_ITEM_CANCEL_REQUEST', action => {
				const id = action.uploaderId ?? action.file?.id
				if (id) {
					for (const active of activeEditUploads.values()) {
						if (active.uploaderId !== id) continue
						if (action.itemId) active.uploader?.cancelItem?.(action.itemId)
						else active.uploader?.cancel?.()
						break
					}
				}
				return action
			}),
		)
		cleanup(
			getModules(
				withProps<RowDataModule>('generateMessageRowData'),
				mod => {
					cleanup(
						after(mod, 'generateMessageRowData', result => {
							const message = result?.message
							const messageId = message?.id
							const active = messageId
								? activeEditUploads.get(messageId)
								: undefined
							if (!message || !messageId || !active) return result
							const uploaderFile =
								getUploadStore()?.getUploaderFileForMessageId(active.uploadKey)
							if (!uploaderFile) return result
							const uploaderId = uploaderFile.id ?? active.uploaderId
							const existingRows = (message.attachments ?? []).filter(
								att => !att.uploaderId && att.id && active.keptIds.has(att.id),
							)
							const currentUploadRows = uploaderId
								? (message.attachments ?? []).filter(
										att => att.uploaderId === uploaderId,
									)
								: []
							if (currentUploadRows.length) {
								message.attachments = [...existingRows, ...currentUploadRows]
								if (result.changeType === 0) result.changeType = 2
								return result
							}
							createUploaderAttachmentsFn ??= resolveCreateUploaderAttachments()
							if (!createUploaderAttachmentsFn) return result
							const uploadRows = createUploaderAttachmentsFn({ uploaderFile })
							message.attachments = [...existingRows, ...uploadRows]
							message.useAttachmentUploadPreview = true
							if (result.changeType === 0) result.changeType = 2
							return result
						}),
					)
				},
				{ max: 1 },
			),
		)
		const report = (error: unknown) => {
			plugin.reportError(error)
			ToastActionCreators.open('ADD_ATTACHMENTS_ERROR', {
				text: getErrorMessage(error),
				variant: 'critical',
			})
		}
		cleanup(
			getModules(
				withProps<{ HTTP: HTTP }>('HTTP'),
				({ HTTP: http }) => {
					cleanup(
						instead(http, 'patch', async function (args, original) {
							const [request, callback] = args
							const edit = pending.get(request.url)
							if (!edit) return Reflect.apply(original, this, args)
							let failedResponse: Response | undefined
							const messageId = request.url.split('/').pop()
							try {
								if (edit.keptExisting.length + edit.newFiles.length > 10)
									throw new Error('A message can have at most 10 attachments.')
								let attachments: AttachmentPayload[] = []
								if (edit.newFiles.length && messageId) {
									if (stopped) throw new Error('AddAttachments was disabled.')
									const uploadKey = `${messageId}_edit_${++uploadSeq}`
									uploadKeyToMessageId.set(uploadKey, messageId)
									activeEditUploads.set(messageId, {
										channelId: edit.channelId,
										uploadKey,
										keptIds: new Set(edit.keptExisting.map(k => k.orig.id)),
									})
									const content = request.body?.content ?? ''
									const uploaded = await uploadAttachments(
										edit.channelId,
										uploadKey,
										content,
										edit.newFiles,
									)
									attachments = uploaded.attachments
									const active = activeEditUploads.get(messageId)
									if (active && uploaded.uploader) {
										active.uploader = uploaded.uploader
										if (uploaded.uploader._file !== undefined)
											active.file = uploaded.uploader._file
									}
								}
								if (stopped) throw new Error('AddAttachments was disabled.')
								const kept = edit.keptExisting.map(({ orig, upload }) =>
									serializeExistingAttachment(orig, upload),
								)
								const result = await new Promise<Response>(
									(resolve, reject) => {
										Reflect.apply(original, this, [
											{
												...request,
												body: {
													...request.body,
													attachments: [...kept, ...attachments],
												},
											},
											(response: Response) => {
												if (
													response.hasErr ||
													response.status < 200 ||
													response.status >= 300
												) {
													failedResponse = response
													reject(
														new Error(
															`Discord rejected the attachment edit (HTTP ${response.status}).`,
														),
													)
												} else resolve(response)
											},
										])
									},
								)
								pending.delete(request.url)
								if (messageId) {
									const serverAtts = result.body?.attachments
									if (Array.isArray(serverAtts)) {
										const serverIds = new Set(serverAtts.map(att => att.id))
										const msg = getMessageStore()?.getMessage(
											edit.channelId,
											messageId,
										)
										for (const att of msg?.attachments ?? []) {
											if (!serverIds.has(att.id))
												deletedAttachmentIds.add(att.id)
										}
									}
								}
								callback(result)
								return result
							} catch (error) {
								restore(request.url)
								report(error)
								callback(
									failedResponse ?? {
										hasErr: true,
										status: 0,
										body: {
											message: getErrorMessage(error),
										},
									},
								)
							} finally {
								if (messageId) clearUploadProgress(messageId)
								pending.delete(request.url)
							}
						}),
					)
				},
				{ max: 1 },
			),
		)
		cleanup(
			getModules(
				withProps<EditActions>('editMessage', 'startEditMessage'),
				actions => {
					cleanup(
						instead(actions, 'editMessage', function (args, original) {
							editMessageInvokeCount += 1
							const [channelId, messageId] = args
							const endpoints = Constants?.Endpoints
							if (
								typeof endpoints !== 'object' ||
								endpoints === null ||
								typeof endpoints.MESSAGE !== 'function'
							)
								return Reflect.apply(original, this, args)
							const url: string = endpoints.MESSAGE(channelId, messageId)
							if (pending.has(url)) return
							const session = editSessions.get(channelId)
							const { keptExisting, newFiles } = splitUploads(channelId)
							const hasExistingChanged = hasExistingModifications(
								session,
								keptExisting,
							)
							if (newFiles.length || hasExistingChanged)
								pending.set(url, { channelId, keptExisting, newFiles })
							try {
								if (session) {
									editSessions.delete(channelId)
									setUploads(channelId, session.stashedDraftUploads)
								} else if (newFiles.length)
									setUploads(
										channelId,
										uploadsFor(channelId).filter(
											file => !newFiles.includes(file),
										),
									)
								return Promise.resolve(
									Reflect.apply(original, this, args),
								).catch(error => {
									restore(url)
									throw error
								})
							} catch (error) {
								restore(url)
								throw error
							}
						}),
					)
				},
				{ max: 1 },
			),
		)
		const patched = new WeakSet<object>()
		cleanup(
			getModules(
				withName<() => ChatInputRefs>('useChatInputRefs'),
				module => {
					if (!('default' in module) || typeof module.default !== 'function')
						return
					cleanup(
						after(module, 'default', refs => {
							const input = refs?.chatInput?.current
							if (!input || !hasSaveEditing(input) || patched.has(input))
								return refs
							patched.add(input)
							cleanup(
								instead(input, 'handleSaveEditing', function (args, original) {
									const channelId = refs.props?.current?.channel?.id
									const message =
										channelId && getEditingMessageRecord(channelId)
									if (!channelId || !message)
										return Reflect.apply(original, this, args)
									const session = editSessions.get(channelId)
									const { keptExisting, newFiles } = splitUploads(channelId)
									const hasAttachmentChanges =
										newFiles.length > 0 ||
										hasExistingModifications(session, keptExisting)
									const textArg =
										typeof args[0] === 'string' ? args[0] : message.content
									const isEmptyTextWithAttachments =
										typeof args[0] === 'string' &&
										args[0].trim() === '' &&
										keptExisting.length + newFiles.length > 0
									const [actions] = lookupModule(
										withProps<EditActions>('editMessage', 'startEditMessage'),
									)
									savingChannels.add(channelId)
									const prevInvokeCount = editMessageInvokeCount
									try {
										if (isEmptyTextWithAttachments && actions) {
											void Promise.resolve(
												actions.editMessage(channelId, message.id, {
													content: textArg,
												}),
											).catch(report)
											actions.endEditMessage?.(channelId)
											return undefined
										}
										const result = Reflect.apply(original, this, args)
										if (
											hasAttachmentChanges &&
											editMessageInvokeCount === prevInvokeCount &&
											actions
										)
											void Promise.resolve(
												actions.editMessage(channelId, message.id, {
													content: textArg,
												}),
											).catch(report)
										return result
									} finally {
										savingChannels.delete(channelId)
										syncChannelEditState(channelId)
									}
								}),
							)
							return refs
						}),
					)
				},
				{ returnNamespace: true, max: 1 },
			),
		)
		if (plugin.startedLate) plugin.requireReload()
	},
})
