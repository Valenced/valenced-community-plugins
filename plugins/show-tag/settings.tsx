import Page from '@valenced/components/Page'
import TableRowAssetIcon from '@valenced/components/TableRowAssetIcon'
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
	const { onlyUsername } = { ...DefaultSettings, ...storage.use() }

	return (
		<Page>
			<TableRowGroup>
				<TableSwitchRow
					icon={<TableRowAssetIcon name="AtIcon" />}
					label="Only show usernames"
					subLabel="Replace the display name with the username instead of adding it."
					value={onlyUsername}
					onValueChange={onlyUsername => storage.set({ onlyUsername })}
				/>
			</TableRowGroup>
		</Page>
	)
}
