import Page from '@valenced/components/Page'
import { Design } from '@valenced/discord/design'
import { DefaultSettings } from './shared'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { Settings } from './shared'

const { TableRowGroup, TableSwitchRow } = Design

type SettingComponentProps = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: Settings }>
>

export default function SettingsComponent({
	api: { jsonStorage: storage },
}: SettingComponentProps) {
	const { muted, suppressEveryone, suppressRoles } = {
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
			</TableRowGroup>
		</Page>
	)
}
