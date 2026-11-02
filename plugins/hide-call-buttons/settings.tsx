import Page from '@valenced/components/Page'
import TableRowAssetIcon from '@valenced/components/TableRowAssetIcon'
import { Design } from '@valenced/discord/design'
import { ScrollView } from 'react-native'
import { DefaultSettings } from './shared'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { Settings } from './shared'

const { Stack, Text, TableRowGroup, TableSwitchRow } = Design

type SettingComponentProps = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: Settings }>
>

export default function SettingsComponent({
	api: { jsonStorage: storage },
}: SettingComponentProps) {
	const settings = { ...DefaultSettings, ...storage.use() }

	return (
		<Page>
			<ScrollView>
				<Stack spacing={24}>
					<Text color="text-muted" variant="text-sm/normal">
						Each switch hides one button in one place. Calls still work from
						everywhere else, and switching one off brings its button straight
						back.
					</Text>
					<TableRowGroup title="Someone's profile">
						<TableSwitchRow
							icon={<TableRowAssetIcon name="PhoneCallIcon" />}
							label="Hide the call button"
							subLabel="The phone button in the row of buttons under a person's name, on the profile that opens when you tap their name or picture."
							value={settings.upHideVoiceButton}
							onValueChange={upHideVoiceButton =>
								storage.set({ upHideVoiceButton })
							}
						/>
					</TableRowGroup>
					<TableRowGroup title="Top of a DM">
						<TableSwitchRow
							icon={<TableRowAssetIcon name="PhoneCallIcon" />}
							label="Hide the call button"
							subLabel="The phone icon at the top right of a DM or group DM, next to search."
							value={settings.dmHideCallButton}
							onValueChange={dmHideCallButton =>
								storage.set({ dmHideCallButton })
							}
						/>
						<TableSwitchRow
							icon={<TableRowAssetIcon name="VideoIcon" />}
							label="Hide the video call button"
							subLabel="The camera icon at the top right of a DM or group DM, next to the phone icon."
							value={settings.dmHideVideoButton}
							onValueChange={dmHideVideoButton =>
								storage.set({ dmHideVideoButton })
							}
						/>
					</TableRowGroup>
					<TableRowGroup title="Friends list">
						<TableSwitchRow
							icon={<TableRowAssetIcon name="PhoneCallIcon" />}
							label="Hide the call button"
							subLabel="The phone button at the right-hand end of each friend's row."
							value={settings.friendsHideCallButton}
							onValueChange={friendsHideCallButton =>
								storage.set({ friendsHideCallButton })
							}
						/>
					</TableRowGroup>
					<TableRowGroup title="While you're in a voice channel">
						<TableSwitchRow
							icon={<TableRowAssetIcon name="VideoIcon" />}
							label="Hide the camera button"
							subLabel="The button that turns your camera on, in the controls at the bottom of the voice channel screen."
							value={settings.hideVCVideoButton}
							onValueChange={hideVCVideoButton =>
								storage.set({ hideVCVideoButton })
							}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
