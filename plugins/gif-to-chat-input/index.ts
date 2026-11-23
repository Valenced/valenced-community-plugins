import { Dispatcher } from '@valenced/discord/common/flux'
import { onFluxEventDispatched, Stores } from '@valenced/discord/flux'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'

interface ChatInputs {
	getBestActiveInputForChannelId(
		channelId: string,
	): { insertText(text: string): void } | undefined
}

interface MessageReference {
	channel_id?: string
	message_id?: string
}

interface MessageActions {
	sendMessage(
		channelId: string,
		message: { content: string },
		clearDraft: boolean,
		options?: {
			location?: string
			messageReference?: MessageReference
			allowedMentions?: { replied_user?: boolean }
		},
	): unknown
	receiveMessage: unknown
}

interface PendingReplyStore {
	getPendingReply(channelId: string): object | undefined
}
interface MessageStore {
	getMessage(channelId: string, messageId: string): object | undefined
}
interface ChannelStore {
	getChannel(channelId: string): object | undefined
}

// The GIF picker clears replies even when its send is intercepted.
const replyGuardMs = 750

export default plugin({
	start({ cleanup, plugin }) {
		let guarded: string | undefined
		let release: ReturnType<typeof setTimeout> | undefined
		cleanup(() => clearTimeout(release))
		cleanup(
			onFluxEventDispatched<{ channelId?: string }>(
				'DELETE_PENDING_REPLY',
				payload => {
					if (!guarded || payload.channelId !== guarded) return payload
					guarded = undefined
					clearTimeout(release)
				},
			),
		)

		function keepReply(
			channelId: string,
			reference: MessageReference | undefined,
			shouldMention: boolean | undefined,
		) {
			const replies = Stores.PendingReplyStore as unknown as PendingReplyStore
			if (!replies.getPendingReply(channelId) && reference?.message_id) {
				const message = (
					Stores.MessageStore as unknown as MessageStore
				).getMessage(reference.channel_id ?? channelId, reference.message_id)
				const channel = (
					Stores.ChannelStore as unknown as ChannelStore
				).getChannel(channelId)
				if (message && channel)
					Dispatcher.dispatch({
						type: 'CREATE_PENDING_REPLY',
						channel,
						message,
						shouldMention: shouldMention ?? true,
						showMentionToggle: true,
					})
			}
			guarded = channelId
			clearTimeout(release)
			release = setTimeout(() => {
				guarded = undefined
			}, replyGuardMs)
		}

		cleanup(
			getModules(
				withProps<ChatInputs>('getBestActiveInputForChannelId'),
				inputs => {
					cleanup(
						getModules(
							withProps<MessageActions>('sendMessage', 'receiveMessage'),
							messages => {
								cleanup(
									instead(messages, 'sendMessage', function (args, original) {
										const [channelId, message, , options] = args
										if (options?.location !== 'gif_reply')
											return Reflect.apply(original, this, args)

										const input =
											inputs.getBestActiveInputForChannelId(channelId)
										if (!input) {
											plugin.reportError(
												'Could not find the chatbox. GIF was not sent.',
											)
											return
										}
										try {
											keepReply(
												channelId,
												options.messageReference,
												options.allowedMentions?.replied_user,
											)
										} catch (error) {
											plugin.reportError(error)
										}
										input.insertText(message.content)
									}),
								)
							},
						),
					)
				},
			),
		)
	},
})
