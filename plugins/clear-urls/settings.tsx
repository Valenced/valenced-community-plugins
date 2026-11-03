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
	const { enabled, cleanOnCopy } = { ...DefaultSettings, ...storage.use() }

	return (
		<Page>
			<TableRowGroup>
				<TableSwitchRow
					label="Enabled"
					value={enabled}
					onValueChange={enabled => storage.set({ enabled })}
				/>
				<TableSwitchRow
					label="Clean copied links"
					value={cleanOnCopy}
					onValueChange={cleanOnCopy => storage.set({ cleanOnCopy })}
				/>
			</TableRowGroup>
		</Page>
	)
}
