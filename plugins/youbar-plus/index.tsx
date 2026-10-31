import { getAssetIdByName } from '@valenced/assets'
import { RootNavigationRef } from '@valenced/discord/modules/main_tabs_v2'
import { getModules, lookupModule } from '@valenced/modules/finders'
import {
	createFilterGenerator,
	FilterScopes,
	withProps,
} from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { useReducer } from 'react'
import SettingsComponent from './settings'

export interface Settings {
	showDMButton: boolean
	showFavoritesButton: boolean
	showSettingsButton: boolean
}

export const DefaultSettings: Settings = {
	showDMButton: false,
	showFavoritesButton: false,
	showSettingsButton: true,
}

export let updateYouBar = () => {}

const withTypeName = createFilterGenerator(
	([name], _, exports) => exports?.type?.name === name,
	([name]) => `youbarplus.typeName(${name})`,
	FilterScopes.Initialized,
)

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: {
		load: true,
		default: DefaultSettings,
	},
	start({ cleanup, jsonStorage: storage, plugin }) {
		if (plugin.startedLate) {
			plugin.requireReload()
			return
		}

		cleanup(
			() => {
				updateYouBar = () => {}
			},
			getModules(
				withTypeName('YouBarNotificationsButton'),
				YouBarNotificationsButton => {
					if (!YouBarNotificationsButton?.type) return

					const chatIcon = getAssetIdByName('ChatIcon')
					const favoritesIcon = getAssetIdByName('StarIcon')
					const settingsIcon = getAssetIdByName('SettingsIcon')

					cleanup(
						instead(YouBarNotificationsButton, 'type', (args, orig) => {
							const [, forceUpdate] = useReducer((x: number) => ~x, 0)
							updateYouBar = forceUpdate

							const res = orig(...args) as any
							if (!res?.props?.children) return res

							const Container = res.type
							const IconButton = res.props.children.type
							const originalProps = res.props.children.props

							const { showDMButton, showFavoritesButton, showSettingsButton } =
								storage.cache ?? DefaultSettings

							return (
								<>
									{showSettingsButton && settingsIcon != null && (
										<Container key="youbar-settings-button">
											<IconButton
												accessibilityLabel="User Settings"
												variant={originalProps?.variant || 'tertiary'}
												size={originalProps?.size || 'sm'}
												icon={settingsIcon}
												onPress={() => {
													RootNavigationRef.getRootNavigationRef()?.navigate(
														'settings',
													)
												}}
											/>
										</Container>
									)}
									{showFavoritesButton && favoritesIcon != null && (
										<Container key="youbar-favorites-button">
											<IconButton
												accessibilityLabel="Favorites"
												variant={originalProps?.variant || 'tertiary'}
												size={originalProps?.size || 'sm'}
												icon={favoritesIcon}
												onPress={() => {
													lookupModule(
														withProps('transitionToGuild'),
													)[0]?.transitionToGuild('@favorites')
												}}
											/>
										</Container>
									)}
									{showDMButton && chatIcon != null && (
										<Container key="youbar-dm-button">
											<IconButton
												accessibilityLabel="Direct Messages"
												variant={originalProps?.variant || 'tertiary'}
												size={originalProps?.size || 'sm'}
												icon={chatIcon}
												onPress={() => {
													lookupModule(
														withProps('transitionToGuild'),
													)[0]?.transitionToGuild('@me')
												}}
											/>
										</Container>
									)}
									{res}
								</>
							)
						}),
					)
				},
			),
		)
	},
	stop({ plugin }) {
		plugin.requireReload()
	},
	SettingsComponent,
})
