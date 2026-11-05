import patcher, { patchActionSheet } from './patches'

export default plugin({
	start({ unscoped, cleanup }) {
		patchActionSheet(cleanup)

		unscoped.ActionSheetPatcher = patcher
	},

	stop({ unscoped }) {
		Reflect.deleteProperty(unscoped, 'ActionSheetPatcher')
	},
})
