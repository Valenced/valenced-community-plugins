import { patchMessageActionSheet, patchSearchListRow } from './patches'

export default plugin({
	start(api) {
		patchSearchListRow(api)
		patchMessageActionSheet(api)
	},
})
