import { ImportTrackerModuleId } from '@valenced/discord/common/import-tracker'
import { withStoreName } from '@valenced/discord/flux'
import { lookupModule } from '@valenced/modules/finders'
import {
	withDependencies,
	withName,
	withProps,
} from '@valenced/modules/finders/filters'

const { atMost, unordered } = withDependencies

export type Upload = {
	id: string
	filename: string
	uploadedFilename?: string
	description?: string | null
	spoiler?: boolean
	status?: string
	cancel?(): void
	removeFromMsgDraft?(): void
	resetState?(): void
}

export type UploaderFile = {
	id: string
	channelId?: string
}

export type Uploader = {
	_file?: UploaderFile
	cancel?(): void
	cancelItem?(itemId: string): void
}

export type AttachmentPayload = {
	id: string
	filename: string
	uploaded_filename?: string
	description?: string | null
	is_spoiler?: boolean
}

export type UploadModuleItem = {
	id: string
	uri: string
	originalUri: string
	filename: string
	mimeType?: string
	width?: number
	height?: number
	platform: number
	origin: number
}

export type UploadModule = {
	default: new (item: UploadModuleItem) => Upload
	isResolvedUpload: (value: object) => boolean
	UploadOrigin?: { FILE_ATTACHMENT?: number }
}

export type RowAttachment = {
	id?: string
	uploaderId?: string
}

export type CreateUploaderAttachmentsFn = (opts: {
	uploaderFile: UploaderFile
}) => RowAttachment[]

type UploadAttachmentsModule = {
	uploadMessageAttachments(options: {
		channelId: string
		nonce: string
		items: Upload[]
		message: {
			id: string
			nonce: string
			channel_id: string
			content: string
		}
		shouldUploadFailureSendNotification?: boolean
	}): Promise<{
		attachments: Upload[]
		uploader?: Uploader
	}>
}

type AttachmentPayloadModule = {
	getAttachmentPayload(file: Upload, index: number): AttachmentPayload
}

export function resolveExistingUploadModule(): UploadModule | undefined {
	const [existing] = lookupModule(
		withProps<UploadModule>('isResolvedUpload', 'UploadOrigin'),
	)
	if (existing) return existing
	const [, evId] = lookupModule(
		withProps('EventEmitter', 'defaultMaxListeners'),
	)
	const [, nitroId] = lookupModule(withProps('getNitroFileUploadLimitBytes'))
	const [, lodashId] = lookupModule(withProps('templateSettings', 'after'))
	const [, uuidId] = lookupModule(withProps('v1', 'v4'))
	if (
		evId === undefined ||
		nitroId === undefined ||
		lodashId === undefined ||
		uuidId === undefined
	)
		return undefined
	const [resolved] = lookupModule(
		withProps<UploadModule>('isResolvedUpload', 'UploadOrigin').and(
			withDependencies([
				evId,
				[ImportTrackerModuleId],
				[nitroId, null, [ImportTrackerModuleId], ImportTrackerModuleId],
				lodashId,
				null,
				uuidId,
				ImportTrackerModuleId,
			]),
		),
	)
	return resolved
}

export function resolveCreateUploaderAttachments():
	| CreateUploaderAttachmentsFn
	| undefined {
	const [existing] = lookupModule(
		withName<CreateUploaderAttachmentsFn>('createUploaderAttachments'),
		{ returnNamespace: true },
	)
	if (
		existing &&
		'default' in existing &&
		typeof existing.default === 'function'
	)
		return existing.default
	const [, attachTypeId] = lookupModule(
		withProps('AttachmentType', 'ReferencedMessageRowState'),
	)
	const [, mediaCheckId] = lookupModule(withProps('isImageFile', 'isVideoFile'))
	const [, obscurityId] = lookupModule(withProps('getAttachmentObscurityProps'))
	const [, intlId] = lookupModule(
		withProps('useSyncMessages', 'getSystemLocale'),
	)
	if (
		attachTypeId === undefined ||
		mediaCheckId === undefined ||
		obscurityId === undefined ||
		intlId === undefined
	)
		return undefined
	const [resolved] = lookupModule(
		withName<CreateUploaderAttachmentsFn>('createUploaderAttachments').and(
			withDependencies([
				attachTypeId,
				mediaCheckId,
				obscurityId,
				intlId,
				null,
				ImportTrackerModuleId,
			]),
		),
		{ returnNamespace: true },
	)
	if (
		resolved &&
		'default' in resolved &&
		typeof resolved.default === 'function'
	)
		return resolved.default
	return undefined
}

function resolveUploadAttachmentsModule(): UploadAttachmentsModule | undefined {
	const [existing] = lookupModule(
		withProps<UploadAttachmentsModule>('uploadMessageAttachments'),
	)
	if (existing) return existing
	let [, uploadStoreId] = lookupModule(withProps('getUploaderFileForMessageId'))
	if (uploadStoreId === undefined)
		[, uploadStoreId] = lookupModule(withStoreName('UploadStore'))
	const [, msgRecId] = lookupModule(
		withProps('createMessageRecord', 'updateMessageRecord'),
	)
	if (uploadStoreId === undefined || msgRecId === undefined) return undefined
	const [resolved] = lookupModule(
		withProps<UploadAttachmentsModule>('uploadMessageAttachments').and(
			withDependencies(unordered([uploadStoreId, msgRecId])).and(
				withDependencies(atMost(8)),
			),
		),
	)
	return resolved
}

function resolveAttachmentPayloadModule(): AttachmentPayloadModule | undefined {
	const [existing] = lookupModule(
		withProps<AttachmentPayloadModule>('getAttachmentPayload'),
	)
	if (existing) return existing
	const [, nitroId] = lookupModule(withProps('getNitroFileUploadLimitBytes'))
	if (nitroId === undefined) return undefined
	const [resolved] = lookupModule(
		withProps<AttachmentPayloadModule>('getAttachmentPayload').and(
			withDependencies([
				nitroId,
				null,
				[ImportTrackerModuleId],
				ImportTrackerModuleId,
			]),
		),
	)
	return resolved
}

export async function uploadAttachments(
	channelId: string,
	uploadKey: string,
	content: string,
	files: Upload[],
) {
	const uploadMod = resolveUploadAttachmentsModule()
	const payloadMod = resolveAttachmentPayloadModule()
	if (!uploadMod || !payloadMod)
		throw new Error('Could not access Discord attachment uploader.')
	const { attachments, uploader } = await uploadMod.uploadMessageAttachments({
		channelId,
		nonce: uploadKey,
		items: files,
		message: {
			id: uploadKey,
			nonce: uploadKey,
			channel_id: channelId,
			content,
		},
		shouldUploadFailureSendNotification: false,
	})
	return {
		attachments: attachments.map((file, index) =>
			payloadMod.getAttachmentPayload(file, index),
		),
		uploader,
	}
}
