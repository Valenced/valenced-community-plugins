import { AlertActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'

/**
 * Asks before a destructive action, in Discord's own alert dialog, with the action in red above
 * Cancel. Call from an event handler (coding rule 1).
 */
export function confirmDestructive(options: {
	title: string
	body: string
	action: string
	onConfirm(): void
}) {
	const { AlertModal, AlertActionButton } = Design
	const key = `bleelblep-confirm-${Date.now()}`
	AlertActionCreators.openAlert(
		key,
		<AlertModal
			title={options.title}
			content={options.body}
			actions={
				<>
					<AlertActionButton
						text={options.action}
						variant="destructive"
						onPress={() => {
							AlertActionCreators.dismissAlert(key)
							options.onConfirm()
						}}
					/>
					<AlertActionButton
						text="Cancel"
						variant="secondary"
						onPress={() => AlertActionCreators.dismissAlert(key)}
					/>
				</>
			}
		/>,
	)
}
