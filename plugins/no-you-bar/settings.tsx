import Page from '@valenced/components/Page'
import { Design } from '@valenced/discord/design'
import { found, useSettings } from './state'
import type { Toggleable } from './state'

export default function SettingsComponent() {
	const settings = useSettings()
	const setTab = (tab: Toggleable, value: boolean) =>
		found.storage?.set({ tabs: { ...settings.tabs, [tab]: value } })
	const tabRow = (tab: Toggleable, label: string, subLabel: string) => (
		<Design.TableSwitchRow
			key={tab}
			label={label}
			subLabel={subLabel}
			value={settings.tabs[tab]}
			// You and Settings cannot both be off, or settings would be
			// unreachable.
			disabled={
				(tab === 'profile' && !settings.tabs.settings) ||
				(tab === 'settings' && !settings.tabs.profile)
			}
			onValueChange={(value: boolean) => setTab(tab, value)}
		/>
	)
	return (
		<Page>
			<Design.TableRowGroup title="Tab bar">
				<Design.TableSwitchRow
					label="Show tab labels"
					subLabel="Names under the tab icons."
					value={settings.showLabels}
					onValueChange={(value: boolean) => {
						found.storage?.set({ showLabels: value })
					}}
				/>
				<Design.TableSwitchRow
					label="Full screen Settings"
					subLabel="Hide the tab bar on the Settings screen. Its close button comes back."
					value={settings.fullScreenSettings}
					onValueChange={(value: boolean) => {
						found.storage?.set({ fullScreenSettings: value })
					}}
				/>
			</Design.TableRowGroup>
			<Design.TableRowGroup title="Tabs">
				<Design.TableRow
					label="Home"
					subLabel="Always on. It is the way back to DMs and servers."
				/>
				{tabRow('notifications', 'Notifications', 'Mentions and replies.')}
				{tabRow(
					'profile',
					'You',
					'Your profile, Quests, Shop, and Nitro. Needs Settings on to turn off.',
				)}
				{tabRow(
					'settings',
					'Settings',
					'When off, Settings goes back in the menu on the You tab. Needs You on to turn off.',
				)}
			</Design.TableRowGroup>
		</Page>
	)
}
