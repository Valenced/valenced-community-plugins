import {
	ActionSheetActionCreators,
	ToastActionCreators,
} from '@valenced/discord/actions'
import { getAssetIdByName } from '@valenced/assets'
import { Clipboard } from '@valenced/externals/react-native-clipboard'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { after, before } from '@valenced/patcher'
import { cloneElement, createElement } from 'react'
import { Image } from 'react-native'

const TAG = '[proxy-link]'
const SHEET_KEY = 'MessageLongPressActionSheet'
const ROW_KEY = 'copy-proxy-link'

let pendingUrl: string | undefined
const isRowGroup = (x: any) =>
	Array.isArray(x) && x[0]?.type?.name === 'ActionSheetRowGroup'

function insertRow(children: any[], url: string) {
	const first = children[0]
	if (!first?.props?.icon) return children

	const row = createElement(first.type, {
		key: ROW_KEY,
		label: 'Copy Proxy Link',
		icon: cloneElement(first.props.icon, {
			IconComponent: () =>
				createElement(Image, {
					source: getAssetIdByName('LinkIcon'),
					style: { width: 24, height: 24 },
				}),
		}),
		onPress: () => {
			ActionSheetActionCreators.hideActionSheet()
			Clipboard?.setString(url)
			ToastActionCreators.open('custom-avatars-copy', { text: 'Link Copied!' })
		},
	})

	const idx = children.findIndex(
		(c: any) =>
			typeof c?.props?.label === 'string' &&
			c.props.label.toLowerCase().includes('message link'),
	)
	const out = [...children]
	if (idx !== -1) out.splice(idx + 1, 0, row)
	else out.push(row)
	return out
}

function addRow(node: any, url: string, depth = 0): any {
	if (!node || typeof node !== 'object' || depth > 100) return node

	if (Array.isArray(node)) {
		if (isRowGroup(node) && Array.isArray(node[1]?.props?.children)) {
			const middle = node[1]
			const out = [...node]
			out[1] = cloneElement(
				middle,
				undefined,
				...insertRow(middle.props.children, url),
			)
			return out
		}
		let changed = false
		const out = node.map((n) => {
			const r = addRow(n, url, depth + 1)
			if (r !== n) changed = true
			return r
		})
		return changed ? out : node
	}

	const kids = node.props?.children
	if (kids == null) return node
	const next = addRow(kids, url, depth + 1)
	return next === kids ? node : cloneElement(node, undefined, next)
}

export default plugin({
	start({ cleanup, plugin: pluginApi }) {
		const reportError = (e: unknown) => pluginApi.reportError(e)
		const patchedSheets = new WeakSet<object>()

		const patchSheet = (instance: any) => {
			if (
				!instance ||
				typeof instance.default !== 'function' ||
				patchedSheets.has(instance)
			)
				return
			patchedSheets.add(instance)
			cleanup(
				after(instance, 'default', (tree: any) => {
					const url = pendingUrl
					if (!url) return tree
					try {
						return addRow(tree, url)
					} catch (e) {
						reportError(e)
						return tree
					}
				}),
			)
		}

		cleanup(
			getModules(withProps('openLazy', 'hideActionSheet'), (sheets: any) => {
				cleanup(
					before(sheets, 'openLazy', (args: any[]) => {
						const [sheet, key, props] = args
						pendingUrl = undefined
						if (key !== SHEET_KEY) return args

						const message = props?.message
						const att = message?.attachments?.[0]
						const emb = message?.embeds?.[0]?.image
						const proxyUrl =
							att?.proxy_url ||
							att?.proxyURL ||
							emb?.proxyURL ||
							emb?.proxy_url
						if (!proxyUrl) return args

						pendingUrl = proxyUrl
						Promise.resolve(sheet).then(patchSheet).catch(reportError)
						return args
					}),
				)
			}),
		)

		console.log(`${TAG} started`)
	},
})
