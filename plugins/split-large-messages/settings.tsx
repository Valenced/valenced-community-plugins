import Page from '@valenced/components/Page'
import TableRowAssetIcon from '@valenced/components/TableRowAssetIcon'
import { Design } from '@valenced/discord/design'
import { DefaultSettings } from './shared'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { Settings } from './shared'

const { Stack, TableRowGroup, TableSwitchRow } = Design

type SettingComponentProps = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: Settings }>
>

export default function SettingsComponent({
	api: { jsonStorage: storage },
}: SettingComponentProps) {
	const { splitOnWords } = { ...DefaultSettings, ...storage.use() }

	return (
		<Page>
			<Stack spacing={24}>
				<TableRowGroup>
					<TableSwitchRow
						icon={<TableRowAssetIcon name="ChatIcon" />}
						label="Split on words"
						subLabel="Split messages on words instead of newlines for fewer messages."
						value={splitOnWords}
						onValueChange={splitOnWords => storage.set({ splitOnWords })}
					/>
				</TableRowGroup>
			</Stack>
		</Page>
	)
}
