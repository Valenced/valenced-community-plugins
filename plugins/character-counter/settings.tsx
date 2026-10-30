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
	const { colorEffects } = { ...DefaultSettings, ...storage.use() }

	return (
		<Page>
			<Stack spacing={24}>
				<TableRowGroup>
					<TableSwitchRow
						icon={<TableRowAssetIcon name="PaintPaletteIcon" />}
						label="Color effects"
						subLabel="Turn the counter yellow and red as you get closer to the limit."
						value={colorEffects}
						onValueChange={colorEffects => storage.set({ colorEffects })}
					/>
				</TableRowGroup>
			</Stack>
		</Page>
	)
}
