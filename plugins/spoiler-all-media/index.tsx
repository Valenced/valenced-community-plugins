import { Dispatcher } from '@valenced/discord/common/flux'
import { Stores } from '@valenced/discord/flux'
import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { after } from '@valenced/patcher'
import { lookupGeneratedIconComponent } from '@valenced/utils/discord'
import { findInReactFiber, useReRender } from '@valenced/utils/react'
import { TouchableOpacity } from 'react-native'
import type { FC, MemoExoticComponent, ReactElement, ReactNode } from 'react'

type Upload = {
	filename: string
	spoiler?: boolean
}

type UploadStore = {
	getUploads?: (channelId: string, draftType: number) => Upload[]
}

type ChannelStore = {
	getChannelId?: () => string | undefined
}

const patched = new Set<unknown>()

let uploadStore: UploadStore | undefined
const channelStores: ChannelStore[] = []

function currentChannelId(): string | undefined {
	for (const store of channelStores) {
		try {
			const id = store.getChannelId?.()
			if (typeof id === 'string' && id.length > 0) return id
		} catch {}
	}
}

function uploadsFor(channelId: string): Upload[] {
	return uploadStore?.getUploads?.(channelId, 0) ?? []
}

function markAll(channelId: string, files: Upload[]): void {
	for (const file of files) {
		if (!file.filename?.startsWith('SPOILER_')) {
			file.filename = `SPOILER_${file.filename}`
		}
		file.spoiler = true
	}
	Dispatcher.dispatch({
		type: 'UPLOAD_ATTACHMENT_SET_UPLOADS',
		channelId,
		draftType: 0,
		uploads: files,
	})
}

function SpoilerAllButton({ channelId }: { channelId: string }) {
	const rerender = useReRender()
	const files = uploadsFor(channelId)
	const Icon =
		lookupGeneratedIconComponent('EyeSlashIcon') ??
		lookupGeneratedIconComponent('EyeIcon')

	if (files.length === 0 || files.every(file => file.spoiler)) return null

	return (
		<TouchableOpacity
			accessibilityLabel="Spoiler all media"
			onPress={() => {
				markAll(channelId, files)
				rerender()
			}}
			style={{
				backgroundColor: '#5865F2',
				padding: 8,
				borderRadius: 8,
				marginHorizontal: 4,
			}}
		>
			{Icon ? <Icon size="sm" color="#FFFFFF" /> : null}
		</TouchableOpacity>
	)
}

function insertButton(tree: ReactElement): ReactElement {
	const node = findInReactFiber(
		tree,
		(node): node is { props: { children: ReactNode[] } } =>
			Array.isArray(node.props?.children),
	)
	if (!node) return tree

	const channelNode = findInReactFiber(
		tree,
		(node): node is { props: { channel?: { id?: string } } } =>
			typeof node.props?.channel?.id === 'string',
	)
	const channelId = channelNode?.props.channel?.id ?? currentChannelId()
	if (!channelId) return tree

	const children = node.props.children
	const index = children.findIndex(
		child => (child as ReactElement | null)?.key === 'spoiler-all-media',
	)
	if (index !== -1) children.splice(index, 1)
	children.push(
		<SpoilerAllButton key="spoiler-all-media" channelId={channelId} />,
	)
	return tree
}

function patchActions<T extends { default: MemoExoticComponent<FC> }>(
	path: string,
	cleanup: (...fns: Array<() => unknown>) => void,
): void {
	cleanup(
		getModuleWithImportedPath<T>(path, ({ default: Actions }) => {
			if (patched.has(Actions)) return
			patched.add(Actions)
			cleanup(
				after(Actions, 'type', tree => insertButton(tree as ReactElement)),
				() => patched.delete(Actions),
			)
		}),
	)
}

export default plugin({
	start({ cleanup }) {
		const named = Stores.SelectedChannelStore as unknown as ChannelStore
		if (named && !channelStores.includes(named)) channelStores.push(named)
		cleanup(
			getModules(
				withProps('getUploads'),
				exports => {
					if (!uploadStore && typeof exports?.getUploads === 'function') {
						uploadStore = exports
					}
				},
				{ max: 5 },
			),
			getModules(
				withProps('getChannelId'),
				exports => {
					if (
						typeof exports?.getChannelId === 'function' &&
						!channelStores.includes(exports)
					) {
						channelStores.push(exports)
					}
				},
				{ max: 20 },
			),
			() => {
				uploadStore = undefined
				channelStores.length = 0
			},
		)

		patchActions<{ default: MemoExoticComponent<FC> }>(
			'modules/chat_input/native/action_buttons/ChatInputRightActions.tsx',
			cleanup,
		)
		cleanup(() => patched.clear())
	},
})
