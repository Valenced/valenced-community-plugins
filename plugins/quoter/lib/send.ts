import { FileModule } from '@valenced/discord/native'
import { lookupModule } from '@valenced/modules/finders'
import {
	allOf,
	withDependencies,
	withProps,
} from '@valenced/modules/finders/filters'
import type { PluginApi } from '@valenced/plugins/types'
import type { RenderedQuote } from '../types'

type NativeUploadItem = {
	platform: number
	uri: string
	originalUri: string
	width: number
	height: number
	filename: string
	mimeType: string
}
interface CloudUpload {
	item: NativeUploadItem
}
interface MessageActions {
	sendMessage(
		channelId: string,
		message: {
			content: string
			invalidEmojis: unknown[]
			validNonShortcutEmojis: unknown[]
			tts: boolean
		},
		clearDraft: boolean,
		options: {
			attachmentsToUpload: CloudUpload[]
			onAttachmentUploadError(
				file: unknown,
				code: unknown,
				reason: unknown,
			): void
		},
	): Promise<{ ok: boolean; status?: number } | undefined>
	receiveMessage: unknown
}

/** Use Discord's upload queue, message validation and retry handling. */
export async function sendQuoteAttachment(
	channelId: string,
	image: RenderedQuote,
	filename: string,
	logger: PluginApi['logger'],
): Promise<void> {
	const match =
		/^data:(image\/(?:png|gif));base64,([A-Za-z0-9+/]+={0,2})$/.exec(
			image.dataUrl,
		)
	if (!match || match[2].length % 4 !== 0)
		throw new Error('Invalid rendered quote image.')
	const [, mimeType, body] = match
	const [messages] = lookupModule(
		withProps<MessageActions>('sendMessage', 'receiveMessage'),
	)
	const [, httpId] = lookupModule(withProps('HTTPResponseError', 'get'))
	if (httpId === undefined)
		throw new Error('Native attachment uploads are unavailable.')
	// CloudUpload is lazy until the first attachment. Match its HTTP, Upload and
	// UploadPlatform dependencies so lookup can initialize it on a fresh launch.
	const { partial, skip, relative } = withDependencies
	const [uploads] = lookupModule(
		allOf(
			withProps<{
				CloudUpload: new (
					item: NativeUploadItem,
					channelId: string,
					index: number,
					allowOptimization: boolean,
				) => CloudUpload
			}>('CloudUpload'),
			withDependencies(partial(skip(8, [httpId, relative(1), relative(2)]))),
		),
	)
	if (!messages || !uploads)
		throw new Error('Native attachment uploads are unavailable.')

	const extension = mimeType === 'image/gif' ? 'gif' : 'png'
	filename = filename.replace(/\.(png|gif)$/i, `.${extension}`)
	const tempPath = `dev.benjii.quoter/${Date.now()}-${Math.random().toString(16).slice(2)}.${extension}`
	const filePath = String(
		await FileModule.writeFile('cache', tempPath, body, 'base64'),
	)
	const uri = filePath.startsWith('file://') ? filePath : `file://${filePath}`
	let handedToDiscord = false
	let sent = false
	try {
		// CloudUpload(item, channelId, index, allowOptimization) is the constructor
		// used by UploadAttachmentStore. Preserve generated PNG/GIF bytes.
		const upload = new uploads.CloudUpload(
			{
				platform: 0, // UploadPlatform.REACT_NATIVE
				uri,
				originalUri: uri,
				width: image.width,
				height: image.height,
				filename,
				mimeType,
			},
			channelId,
			0,
			false,
		)
		let uploadError: Error | undefined
		handedToDiscord = true
		const result = await messages.sendMessage(
			channelId,
			{
				content: '',
				invalidEmojis: [],
				validNonShortcutEmojis: [],
				tts: false,
			},
			false,
			{
				attachmentsToUpload: [upload],
				onAttachmentUploadError(_file, code, reason) {
					logger.warn('Native quote upload failed', code, reason)
					uploadError = new Error('Could not upload the quote attachment.')
				},
			},
		)
		if (uploadError) throw uploadError
		if (!result?.ok)
			throw new Error(
				'Discord could not send the quote. Check the failed message before retrying.',
			)
		sent = true
	} finally {
		// Discord may retain failed uploads for retry. Keep their cache files until
		// the host clears its cache; deleting here would break the native retry UI.
		if (sent || !handedToDiscord) {
			try {
				await FileModule.removeFile('cache', tempPath)
			} catch (error) {
				logger.warn('Could not remove cached quote', error)
			}
		}
	}
}
