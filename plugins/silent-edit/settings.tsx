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
	const { overrideNative } = { ...DefaultSettings, ...storage.use() }

	return (
		<Page>
			<TableRowGroup>
				<TableSwitchRow
					icon={<TableRowAssetIcon name="PencilIcon" />}
					label="Silent Edit"
					subLabel="Replace the original edit with a silent edit."
					value={overrideNative}
					onValueChange={overrideNative => storage.set({ overrideNative })}
				/>
			</TableRowGroup>
		</Page>
	)
}
