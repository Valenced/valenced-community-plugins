import {
	onImportedPath,
	resolveComponent,
	safeAfterJSX,
	safeInstead,
	safeInsteadJSX,
} from '../modules'
import { getSettings } from '../state'
import type { PluginCleanupApi } from '@valenced/plugins/types'

/*
 *   8736  modules/collectibles/avatar_decorations/useAvatarDecoration.tsx
 *   1880  modules/collectibles/avatar_decorations/AvatarDecorationUtils.tsx
 *   13281 design/void/Avatar/native/Avatar.tsx
 */
export function patchAvatarDecorations(cleanup: PluginCleanupApi): void {
	const enabled = () => getSettings().avatarDecorations

	/** Check if value is a normal decoration OBJECT (not a preview string URL) */
	const isNormalDecoration = (v: any): boolean =>
		v != null &&
		typeof v === 'object' &&
		!(typeof v === 'string' && v.startsWith('http'))

	cleanup(
		onImportedPath<any>(
			'modules/collectibles/avatar_decorations/useAvatarDecoration.tsx',
			ns => {
				cleanup(
					safeInstead(ns, 'useAvatarDecoration', (args, original) => {
						const decoration = original(...args)
						return enabled() ? null : decoration
					}),
				)
				cleanup(
					safeInstead(ns, 'getAvatarDecoration', (args, original) => {
						const on = enabled()
						if (!on) return original(...args)
						return null
					}),
				)
			},
		),
	)

	cleanup(
		onImportedPath<any>('design/void/Avatar/native/Avatar.tsx', ns => {
			const avatar = resolveComponent(ns)
			if (!avatar) return
			cleanup(
				safeAfterJSX(avatar, el => {
					const on = enabled()
					const deco = el?.props?.avatarDecoration
					if (!on || deco == null || !isNormalDecoration(deco)) return el
					return { ...el, props: { ...el.props, avatarDecoration: null } }
				}),
			)
			cleanup(
				safeInsteadJSX(avatar, (args, jsx) => {
					const on = enabled()
					const deco = args?.[1]?.avatarDecoration
					if (!on || deco == null || !isNormalDecoration(deco))
						return jsx(...args)
					return jsx(args[0], { ...args[1], avatarDecoration: null }, args[2])
				}),
			)
		}),
	)

	cleanup(
		onImportedPath<any>(
			'modules/collectibles/avatar_decorations/AvatarDecorationUtils.tsx',
			ns => {
				cleanup(
					safeInstead(ns, 'parseAvatarDecorationData', (args, original) => {
						const on = enabled()
						if (!on) return original(...args)
						return null
					}),
				)
			},
		),
	)
}
