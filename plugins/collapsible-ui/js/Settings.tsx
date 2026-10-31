import Page from '@valenced/components/Page'
import { AlertActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { isServerDrawerActive } from './Guildbar'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'

export interface Settings {
	collapsibleGuildbar: boolean
	collapsibleHeader: boolean
	collapsibleYouBar: boolean
	collapsibleInput: boolean
}

export const defaults: Settings = {
	collapsibleGuildbar: false,
	collapsibleHeader: true,
	collapsibleYouBar: true,
	collapsibleInput: true,
}

export default function SettingsComponent({
	api: { jsonStorage },
}: ComponentProps<PluginSettingsComponent<{ jsonStorage: Settings }>>) {
	const settings = { ...defaults, ...jsonStorage.use() }
	return (
		<Page>
			<Design.TableRowGroup title="Collapsible surfaces">
				<Design.TableSwitchRow
					label="Channel headers"
					subLabel="Drag the strip up to collapse; down to expand. Tap to toggle."
					value={settings.collapsibleHeader}
					onValueChange={collapsibleHeader =>
						jsonStorage.set({ collapsibleHeader })
					}
				/>
				<Design.TableSwitchRow
					label="You bar"
					subLabel="Drag the strip down to collapse; up to expand. Tap to toggle."
					value={settings.collapsibleYouBar}
					onValueChange={collapsibleYouBar =>
						jsonStorage.set({ collapsibleYouBar })
					}
				/>
				<Design.TableSwitchRow
					label="Chat box"
					subLabel="Drag the strip down to collapse; up to expand. Replies and edits reopen the box."
					value={settings.collapsibleInput}
					onValueChange={collapsibleInput =>
						jsonStorage.set({ collapsibleInput })
					}
				/>
				<Design.TableSwitchRow
					label="Collapsible guildbar"
					subLabel="Swipe left on the guildbar to hide it. Swipe right on the channel or messages list to restore it."
					value={settings.collapsibleGuildbar}
					onValueChange={collapsibleGuildbar => {
						if (collapsibleGuildbar && isServerDrawerActive()) {
							const key = 'dev.benjii.collapsible-ui.guildbar-conflict'
							AlertActionCreators.openAlert(
								key,
								<Design.AlertModal
									title="Disable Server Drawer first"
									content="Disable Server Drawer and reload Discord before using Collapsible guildbar."
									actions={
										<Design.AlertActionButton
											text="Okay"
											variant="primary"
											onPress={() => AlertActionCreators.dismissAlert(key)}
										/>
									}
								/>,
							)
							return
						}
						jsonStorage.set({ collapsibleGuildbar })
					}}
				/>
			</Design.TableRowGroup>
		</Page>
	)
}
