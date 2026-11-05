import { before } from '@valenced/patcher'
import { ReactJSXRuntime } from '@valenced/react'
import { createDirectMessagesEntryPatcher } from './button'
import {
	augmentGuildsBarListProps,
	isGuildsBarListProps,
	resetLayoutBridge,
} from './layout'

function patchGuildsBarList<Args extends [unknown, unknown?, ...unknown[]]>(
	args: Args,
): Args {
	const props = args[1]
	if (!isGuildsBarListProps(props)) return args

	args[1] = augmentGuildsBarListProps(props)
	return args
}

export default plugin({
	start({ cleanup, plugin }) {
		if (plugin.startedLate) {
			plugin.requireReload()
			return
		}

		const patchEntry = createDirectMessagesEntryPatcher()

		cleanup(
			before(ReactJSXRuntime, 'jsx', patchEntry),
			before(ReactJSXRuntime, 'jsxs', patchEntry),
			before(ReactJSXRuntime, 'jsx', patchGuildsBarList),
			before(ReactJSXRuntime, 'jsxs', patchGuildsBarList),
			resetLayoutBridge,
		)
	},
	stop({ plugin }) {
		plugin.requireReload()
	},
})
