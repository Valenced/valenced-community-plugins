import Page from '@valenced/components/Page'
import TableRowAssetIcon from '@valenced/components/TableRowAssetIcon'
import { Design } from '@valenced/discord/design'
import { useEffect } from 'react'
import { DefaultSettings, updateYouBar } from './index'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { Settings } from './index'

const { TableRowGroup, TableSwitchRow } = Design

type Props = ComponentProps<PluginSettingsComponent<{ jsonStorage: Settings }>>

export default function SettingsComponent({
	api: { jsonStorage: storage },
}: Props) {
	const settings = storage.use() ?? DefaultSettings

	useEffect(() => {
		return () => {
			updateYouBar()
		}
	}, [])

	return (
		<Page>
			<TableRowGroup title="Buttons">
				<TableSwitchRow
					icon={<TableRowAssetIcon name="SettingsIcon" />}
					label="Settings"
					subLabel="Show the Settings button in the YouBar."
					value={settings.showSettingsButton}
					onValueChange={showSettingsButton => {
						storage.set({ showSettingsButton })
					}}
				/>
				<TableSwitchRow
					icon={<TableRowAssetIcon name="ChatIcon" />}
					label="Direct Messages"
					subLabel="Show the Direct Messages button in the YouBar."
					value={settings.showDMButton}
					onValueChange={showDMButton => {
						storage.set({ showDMButton })
					}}
				/>
				<TableSwitchRow
					icon={<TableRowAssetIcon name="StarIcon" />}
					label="Favorites"
					subLabel="Show the Favorites button in the YouBar."
					value={settings.showFavoritesButton}
					onValueChange={showFavoritesButton => {
						storage.set({ showFavoritesButton })
					}}
				/>
			</TableRowGroup>
		</Page>
	)
}
