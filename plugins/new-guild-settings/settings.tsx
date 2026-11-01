import Page from '@valenced/components/Page'
import { Design } from '@valenced/discord/design'
import { DefaultSettings, MessageNotifications } from './shared'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { Settings } from './shared'

const { TableRadioGroup, TableRadioRow, TableRowGroup, TableSwitchRow } = Design

type SettingComponentProps = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: Settings }>
>

export default function SettingsComponent({
	api: { jsonStorage: storage },
}: SettingComponentProps) {
	const {
		muted,
		messageNotifications,
		suppressEveryone,
		suppressRoles,
		suppressHighlights,
		muteEvents,
		muteMobilePush,
		showAllChannels,
		hideVoiceNames,
	} = {
		...DefaultSettings,
		...storage.use(),
	}

	return (
		<Page>
			<TableRowGroup title="When joining a server">
				<TableSwitchRow
					label="Mute server"
					value={muted}
					onValueChange={muted => storage.set({ muted })}
				/>
				<TableSwitchRow
					label="Suppress @everyone and @here"
					value={suppressEveryone}
					onValueChange={suppressEveryone => storage.set({ suppressEveryone })}
				/>
				<TableSwitchRow
					label="Suppress all role @mentions"
					value={suppressRoles}
					onValueChange={suppressRoles => storage.set({ suppressRoles })}
				/>
				<TableSwitchRow
					label="Suppress highlights"
					value={suppressHighlights}
					onValueChange={suppressHighlights =>
						storage.set({ suppressHighlights })
					}
				/>
				<TableSwitchRow
					label="Mute new events"
					value={muteEvents}
					onValueChange={muteEvents => storage.set({ muteEvents })}
				/>
				<TableSwitchRow
					label="Mute mobile push notifications"
					value={muteMobilePush}
					onValueChange={muteMobilePush => storage.set({ muteMobilePush })}
				/>
				<TableSwitchRow
					label="Show all channels"
					value={showAllChannels}
					onValueChange={showAllChannels => storage.set({ showAllChannels })}
				/>
				<TableSwitchRow
					label="Hide names in voice channels"
					value={hideVoiceNames}
					onValueChange={hideVoiceNames => storage.set({ hideVoiceNames })}
				/>
			</TableRowGroup>
			<TableRadioGroup
				title="Server notification settings"
				defaultValue={messageNotifications}
				onChange={(messageNotifications: MessageNotifications) =>
					storage.set({ messageNotifications })
				}
			>
				<TableRadioRow
					label="All messages"
					value={MessageNotifications.AllMessages}
				/>
				<TableRadioRow
					label="Only @mentions"
					value={MessageNotifications.OnlyMentions}
				/>
				<TableRadioRow
					label="Nothing"
					value={MessageNotifications.NoMessages}
				/>
				<TableRadioRow
					label="Server default"
					value={MessageNotifications.ServerDefault}
				/>
			</TableRadioGroup>
		</Page>
	)
}
