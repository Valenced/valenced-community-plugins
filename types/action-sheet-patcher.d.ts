import '@valenced/plugins/types'
import type ActionSheetPatcher from '../plugins/action-sheet-patcher/js/patches'

declare module '@valenced/plugins/types' {
	interface UnscopedPluginApi {
		ActionSheetPatcher: typeof ActionSheetPatcher
	}
}
