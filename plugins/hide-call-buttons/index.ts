import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { after } from '@valenced/patcher'
import { getErrorStack } from '@valenced/utils/error'
import { cloneElement, isValidElement } from 'react'
import SettingsComponent from './settings'
import { DefaultSettings } from './shared'
import type { ReactElement, ReactNode } from 'react'
import type { Settings } from './shared'

interface NodeProps {
	children?: ReactNode
	onPress?: unknown
	disabled?: unknown
	accessibilityActions?: { name?: unknown }[]
	trailing?: ReactNode
}

type Node = ReactElement<NodeProps>
type Prune = (rendered: ReactNode, settings: Settings) => ReactNode
type Render = (...args: unknown[]) => ReactNode

// Discord's compiler reuses rendered elements, so every change below is made on a copy

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: {
		load: true,
		default: DefaultSettings,
	},
	start({ cleanup, jsonStorage, plugin }) {
		const reported = new Set<string>()

		for (const [path, label, prune] of Surfaces) {
			cleanup(
				getModuleWithImportedPath<{ default?: unknown }>(path, module => {
					// React.memo components keep their render in .type
					const component = module?.default
					const [host, key] =
						typeof component === 'object' &&
						typeof (component as { type?: unknown } | null)?.type === 'function'
							? [component, 'type']
							: typeof component === 'function'
								? [module, 'default']
								: []
					if (!host || !key) return

					cleanup(
						after(host as Record<string, Render>, key, rendered => {
							try {
								return prune(rendered, {
									...DefaultSettings,
									...jsonStorage.cache,
								})
							} catch (e) {
								const message = `Failed to hide ${label} buttons: ${getErrorStack(e)}`
								if (!reported.has(message)) {
									reported.add(message)
									plugin.reportError(message)
								}
								return rendered
							}
						}),
					)
				}),
			)
		}
	},
	// Unpatching can't undo what Discord already rendered
	stop({ plugin }) {
		plugin.requireReload()
	},
	SettingsComponent,
})

// isValidElement alone misses elements with an older $$typeof tag, like the DM header's
function isNode(node: unknown): node is Node {
	if (isValidElement<NodeProps>(node)) return true
	const candidate = node as { $$typeof?: unknown; props?: unknown } | null
	return (
		typeof candidate === 'object' &&
		candidate !== null &&
		candidate.$$typeof !== undefined &&
		typeof candidate.props === 'object' &&
		candidate.props !== null
	)
}

function hasPress(node: Node) {
	return typeof node.props.onPress === 'function'
}

// Each step indexes props.children; -1 means a single non-array child
function getAtPath(root: ReactNode, path: number[]): ReactNode {
	let node = root
	for (const step of path) {
		if (!isNode(node)) return undefined
		const children = node.props.children
		node =
			step === -1
				? children
				: Array.isArray(children)
					? (children[step] as ReactNode)
					: undefined
	}
	return node
}

function replaceChildren(
	root: Node,
	path: number[],
	children: ReactNode[],
): Node {
	if (path.length === 0) return cloneElement(root, undefined, ...children)
	const [head, ...rest] = path
	const current = root.props.children
	if (!Array.isArray(current)) return root
	const target = current[head]
	if (!isNode(target)) return root
	const next = [...current]
	next[head] = replaceChildren(target, rest, children)
	return cloneElement(root, undefined, ...next)
}

function pressablePaths(root: ReactNode): number[][] {
	const found: number[][] = []
	const visit = (node: ReactNode, path: number[], depth: number) => {
		if (depth > 8 || !isNode(node)) return
		const kids = node.props.children
		if (isNode(kids)) {
			const child = [...path, -1]
			if (hasPress(kids)) found.push(child)
			visit(kids, child, depth + 1)
			return
		}
		if (!Array.isArray(kids)) return
		kids.forEach((kid: ReactNode, i: number) => {
			if (!isNode(kid)) return
			const child = [...path, i]
			if (hasPress(kid)) found.push(child)
			visit(kid, child, depth + 1)
		})
	}
	visit(root, [], 0)
	return found
}

// Climb while the subtree holds only the last button, so a two-button row loses its whole cell
function removeLastPressable(root: Node) {
	const paths = pressablePaths(root)
	if (paths.length < 2) return
	const target = paths[paths.length - 1]

	let chosen = target
	for (let len = target.length - 1; len >= 1; len--) {
		const prefix = target.slice(0, len)
		if (pressablePaths(getAtPath(root, prefix)).length !== 1) break
		chosen = prefix
	}

	const path = chosen.slice(0, -1)
	const container = getAtPath(root, path)
	if (!isNode(container) || !Array.isArray(container.props.children)) return
	const drop = chosen[chosen.length - 1]
	const kept = (container.props.children as ReactNode[]).filter(
		(_, i) => i !== drop,
	)
	return kept.length > 0 ? replaceChildren(root, path, kept) : undefined
}

function mapElements(
	node: ReactNode,
	fn: (element: Node) => Node,
	depth = 0,
): ReactNode {
	if (depth > 10) return node
	if (Array.isArray(node)) {
		let changed = false
		const mapped = node.map((child: ReactNode) => {
			const next = mapElements(child, fn, depth + 1)
			if (next !== child) changed = true
			return next
		})
		return changed ? mapped : node
	}
	if (!isNode(node)) return node
	const children = node.props.children
	const next =
		children == null ? children : mapElements(children, fn, depth + 1)
	return fn(next === children ? node : cloneElement(node, undefined, next))
}

// The call button is always last in the profile's action row
const pruneProfile: Prune = (root, settings) => {
	if (!settings.upHideVoiceButton || !isNode(root)) return root
	return removeLastPressable(root) ?? root
}

// Only the call and video buttons have a disabled prop, in that order
const pruneDM: Prune = (root, settings) => {
	const { dmHideCallButton, dmHideVideoButton } = settings
	if ((!dmHideCallButton && !dmHideVideoButton) || !isNode(root)) return root
	const children = root.props.children
	if (!Array.isArray(children)) return root

	const toggles = (children as ReactNode[]).flatMap((child, i) =>
		isNode(child) && hasPress(child) && 'disabled' in child.props ? [i] : [],
	)
	const drop = new Set<number>()
	if (dmHideCallButton && toggles.length > 0) drop.add(toggles[0])
	if (dmHideVideoButton && toggles.length > 1) drop.add(toggles[1])
	if (drop.size === 0) return root
	const kept = (children as ReactNode[]).filter((_, i) => !drop.has(i))
	return kept.length > 0 ? cloneElement(root, undefined, ...kept) : root
}

// accessibilityActions and the trailing buttons line up index for index
const pruneFriends: Prune = (root, settings) => {
	if (!settings.friendsHideCallButton || !isNode(root)) return root
	return mapElements(root, element => {
		const actions = element.props.accessibilityActions
		const trailing = element.props.trailing
		const buttons = isNode(trailing) ? trailing.props.children : undefined
		const index = Array.isArray(actions)
			? actions.findIndex(
					action => String(action?.name).toLowerCase() === 'call',
				)
			: -1
		if (
			!isNode(trailing) ||
			index < 0 ||
			!Array.isArray(buttons) ||
			buttons.length !== actions?.length
		)
			return element
		return cloneElement(element, {
			accessibilityActions: actions.filter((_, i) => i !== index),
			trailing: cloneElement(
				trailing,
				undefined,
				...(buttons as ReactNode[]).filter((_, i) => i !== index),
			),
		})
	})
}

const pruneVoice: Prune = (root, settings) =>
	settings.hideVCVideoButton ? null : root

const Surfaces: [path: string, label: string, prune: Prune][] = [
	[
		'modules/user_profile/native/UserProfileContactButtons.tsx',
		'profile',
		pruneProfile,
	],
	[
		'modules/main_tabs_v2/native/channel/header/PrivateChannelButtons.tsx',
		'DM header',
		pruneDM,
	],
	[
		'modules/main_tabs_v2/native/shared_components/user_list/UserRow.tsx',
		'friends list',
		pruneFriends,
	],
	[
		'modules/voice_panel/native/controls/buttons/VoicePanelVideoButton.tsx',
		'voice channel',
		pruneVoice,
	],
]
