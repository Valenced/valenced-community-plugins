import {
	findByImportedPath,
	waitForImportedPath,
} from '../../../shared/finders'
import { getYouBarStorage } from '../lib/storage'
import { DEFAULT_STORAGE, getActiveButtons, getNormalizedOrder } from '../lib/types'
import type { YouBarPlusStorage } from '../lib/types'

let updateCallbacks: Array<() => void> = []

export function requestYouBarUpdate() {
	for (const cb of updateCallbacks) {
		try {
			cb()
		} catch {}
	}
}

let cachedTransitionRouter: any = null
let cachedUserSettingsRouter: any = null
let cachedRootNavigationRef: any = null

function getTransitionRouter(_storage?: JsonStorage<YouBarPlusStorage>) {
	if (typeof cachedTransitionRouter?.transitionToGuild === 'function') {
		return cachedTransitionRouter
	}

	const everest = (globalThis as any).__everest ?? (valenced as any)?.everest
	if (typeof everest?.transitionToGuild === 'function') {
		cachedTransitionRouter = everest
		return everest
	}

	try {
		const direct = findByImportedPath('modules/routing/router_utils.tsx')
		const target = direct?.default ?? direct
		if (typeof target?.transitionToGuild === 'function') {
			cachedTransitionRouter = target
			return target
		}
	} catch {}

	try {
		const { filters, lookupModule } = valenced.modules.finders
		const res = lookupModule(filters.withProps('transitionToGuild'))
		if (res && res !== valenced.modules.finders.NotFoundResult && res[0]) {
			const mod = res[0]?.default ?? res[0]
			if (typeof mod?.transitionToGuild === 'function') {
				cachedTransitionRouter = mod
				return mod
			}
		}
	} catch {}

	return undefined
}

function getRootNavigation() {
	if (typeof cachedRootNavigationRef?.getRootNavigationRef === 'function') {
		try {
			const nav = cachedRootNavigationRef.getRootNavigationRef()
			if (nav) return nav
		} catch {}
	}

	try {
		const valencedNav = (
			valenced.discord as any
		)?.modules?.mainTabsV2?.RootNavigationRef?.getRootNavigationRef?.()
		if (valencedNav) return valencedNav
	} catch {}

	try {
		const direct = findByImportedPath(
			'modules/main_tabs_v2/RootNavigationRef.native.tsx',
		)
		const target = (direct as any)?.default ?? direct
		if (typeof target?.getRootNavigationRef === 'function') {
			cachedRootNavigationRef = target
			return target.getRootNavigationRef()
		}
	} catch {}

	try {
		const { filters, lookupModule } = valenced.modules.finders
		const res = lookupModule(filters.withProps('getRootNavigationRef'))
		if (res && res !== valenced.modules.finders.NotFoundResult && res[0]) {
			const mod = res[0]?.default ?? res[0]
			if (typeof mod?.getRootNavigationRef === 'function') {
				cachedRootNavigationRef = mod
				return mod.getRootNavigationRef()
			}
		}
	} catch {}

	return undefined
}

function getUserSettingsRouter(_storage?: JsonStorage<YouBarPlusStorage>) {
	if (typeof cachedUserSettingsRouter?.openUserSettings === 'function') {
		return cachedUserSettingsRouter
	}

	const everest = (globalThis as any).__everest ?? (valenced as any)?.everest
	if (typeof everest?.openUserSettings === 'function') {
		cachedUserSettingsRouter = everest
		return everest
	}

	try {
		const direct = findByImportedPath(
			'modules/user_settings/core/native/openUserSettings.tsx',
		)
		const target = direct?.default ?? direct
		if (
			typeof target?.openUserSettings === 'function' &&
			!target.$$baseObject &&
			!target.$$loader
		) {
			cachedUserSettingsRouter = target
			return target
		}
	} catch {}

	try {
		const { filters, lookupModule } = valenced.modules.finders
		const res = lookupModule(filters.withProps('openUserSettings'))
		if (res && res !== valenced.modules.finders.NotFoundResult && res[0]) {
			const mod = res[0]?.default ?? res[0]
			if (typeof mod?.openUserSettings === 'function') {
				cachedUserSettingsRouter = mod
				return mod
			}
		}
	} catch {}

	try {
		const f = Object.assign(
			(_id: any, exp: any) => {
				const t = exp?.default ?? exp
				if (!t || typeof t !== 'object') return false
				if (t.$$baseObject || t.$$loader || t.messages || t.defaultLocale)
					return false
				return typeof t.openUserSettings === 'function'
			},
			{ key: 'userSettingsAction', scopes: 4 },
		)
		const res = valenced.modules.finders.lookupModule(f as any)
		if (res && res !== valenced.modules.finders.NotFoundResult && res[0]) {
			const t = res[0]?.default ?? res[0]
			if (typeof t?.openUserSettings === 'function') {
				cachedUserSettingsRouter = t
				return t
			}
		}
	} catch {}

	return undefined
}

function handleSettingsButtonPress(_storage?: JsonStorage<YouBarPlusStorage>) {
	
	try {
		const router = getUserSettingsRouter(_storage)
		if (typeof router?.openUserSettings === 'function') {
			router.openUserSettings('Overview')
			return
		}
	} catch (e) {
		console.warn(
			'[YouBar+] router.openUserSettings failed, falling back to RootNavigation:',
			e,
		)
	}

	
	try {
		const nav = getRootNavigation()
		if (nav && typeof nav.navigate === 'function') {
			const state = nav.getState?.() || nav.getRootState?.()
			const routeNames: string[] = state?.routeNames || []

			if (routeNames.includes('settings')) {
				nav.navigate('settings')
				return
			}
			if (routeNames.includes('Settings')) {
				nav.navigate('Settings')
				return
			}
			if (routeNames.includes('UserSettings')) {
				nav.navigate('UserSettings')
				return
			}
			if (routeNames.includes('user_settings')) {
				nav.navigate('user_settings')
				return
			}

			
			nav.navigate('settings')
			return
		}
	} catch (e) {
		console.error('[YouBar+] RootNavigation settings navigation failed:', e)
	}

	
	try {
		const everest = (globalThis as any).__everest ?? (valenced as any)?.everest
		if (typeof everest?.openUserSettings === 'function') {
			everest.openUserSettings('Overview')
			return
		}
	} catch {}

	
	try {
		const nav = getRootNavigation()
		if (nav && typeof nav.navigate === 'function') {
			nav.navigate('tabs', { screen: 'you' })
		}
	} catch {}
}

let lastDmTapTime = 0
let lastSavedNonDmLocation: { guildId: string; channelId?: string } | null =
	null

export function getCurrentNonDmLocation(): {
	guildId: string
	channelId?: string
} | null {
	try {
		const guildStore = valenced.modules.finders.lookupModule(
			valenced.modules.finders.filters.withProps(
				'getGuildId',
				'getLastSelectedGuildId',
			),
		)?.[0]
		const channelStore =
			valenced.everest?.getSelectedChannelStore?.() ||
			valenced.modules.finders.lookupModule(
				valenced.modules.finders.filters.withProps(
					'getChannelId',
					'getLastSelectedChannelId',
				),
			)?.[0]

		const currentGuildId = guildStore?.getGuildId()
		if (currentGuildId && currentGuildId !== '@me') {
			const channelId =
				channelStore?.getChannelId?.(currentGuildId) ||
				channelStore?.getMostRecentSelectedTextChannelId?.(currentGuildId)
			return { guildId: currentGuildId, channelId }
		}

		const lastGuildId = guildStore?.getLastSelectedGuildId?.()
		if (lastGuildId && lastGuildId !== '@me') {
			const channelId =
				channelStore?.getChannelId?.(lastGuildId) ||
				channelStore?.getMostRecentSelectedTextChannelId?.(lastGuildId)
			return { guildId: lastGuildId, channelId }
		}
	} catch {}
	return null
}

function handleDmButtonPress(storage?: JsonStorage<YouBarPlusStorage>) {
	try {
		const now = Date.now()
		const router = getTransitionRouter(storage)
		const nonDm = getCurrentNonDmLocation()

		const guildStore = valenced.modules.finders.lookupModule(
			valenced.modules.finders.filters.withProps(
				'getGuildId',
				'getLastSelectedGuildId',
			),
		)?.[0]
		const currentGuildId = guildStore?.getGuildId()
		const isCurrentlyInDms = currentGuildId === '@me' || currentGuildId === null

		const doubleTapEnabled = getYouBarStorage().doubleTapReturn !== false
		const isDoubleTap = doubleTapEnabled && now - lastDmTapTime < 500

		if (isDoubleTap && isCurrentlyInDms) {
			const target = lastSavedNonDmLocation || nonDm
			if (target?.guildId) {
				router?.transitionToGuild?.(target.guildId, target.channelId)
				lastDmTapTime = 0
				return
			}
		}

		lastDmTapTime = isCurrentlyInDms ? now : 0

		if (!isCurrentlyInDms && nonDm?.guildId) {
			lastSavedNonDmLocation = nonDm
		}

		router?.transitionToGuild?.('@me')
	} catch (e) {
		console.error('[YouBar+] DM button error:', e)
	}
}

let lastFavoritesTapTime = 0
let lastSavedNonFavoritesLocation: { guildId: string; channelId?: string } | null = null

function navigateToBuiltinFavorites(storage?: JsonStorage<YouBarPlusStorage>): boolean {
	try {
		const router = getTransitionRouter(storage)
		if (typeof router?.transitionToGuild === 'function') {
			router.transitionToGuild('@favorites')
			return true
		}
		if (typeof router?.transitionTo === 'function') {
			router.transitionTo('/channels/@favorites')
			return true
		}

		const guildActions = valenced.modules.finders.lookupModule(
			valenced.modules.finders.filters.withProps('selectGuild'),
		)?.[0]
		const gActions = guildActions?.default ?? guildActions
		if (typeof gActions?.selectGuild === 'function') {
			gActions.selectGuild('@favorites')
			return true
		}
	} catch (e) {
		console.error('[YouBar+] Failed to navigate to built-in favorites:', e)
	}
	return false
}

function openFavoritesActionSheet(storage?: JsonStorage<YouBarPlusStorage>) {
	try {
		const favStore = valenced.modules.finders.lookupModule(
			valenced.modules.finders.filters.withProps('getFavoriteChannels'),
		)?.[0]
		const store = favStore?.default ?? favStore
		const channelsMap = store?.getFavoriteChannels?.()
		const channelIds = channelsMap ? Object.keys(channelsMap) : []

		const channelStore = valenced.modules.finders.lookupModule(
			valenced.modules.finders.filters.withProps('getChannel', 'hasChannel'),
		)?.[0]
		const cStore = channelStore?.default ?? channelStore

		const guildStore = valenced.modules.finders.lookupModule(
			valenced.modules.finders.filters.withProps('getGuild', 'getGuilds'),
		)?.[0]
		const gStore = guildStore?.default ?? guildStore

		const router = getTransitionRouter(storage)
		const channelActions = valenced.modules.finders.lookupModule(
			valenced.modules.finders.filters.withProps('selectChannel', 'selectPrivateChannel'),
		)?.[0]
		const cActions = channelActions?.default ?? channelActions

		const navigateToChannel = (channelId: string) => {
			const ch = cStore?.getChannel?.(channelId)
			if (ch?.guild_id && ch.guild_id !== '@me' && ch.guild_id !== '@favorites') {
				router?.transitionToGuild?.(ch.guild_id, channelId)
			} else if (typeof cActions?.selectChannel === 'function') {
				cActions.selectChannel({ channelId })
			} else {
				router?.transitionToGuild?.('@me', channelId)
			}
		}

		const actions = valenced.discord.actions.ActionSheetActionCreators
		if (!actions?.openLazy) {
			if (channelIds[0]) navigateToChannel(channelIds[0])
			return
		}

		const items = channelIds.map(id => {
			const ch = cStore?.getChannel?.(id)
			const g = ch?.guild_id ? gStore?.getGuild?.(ch.guild_id) : null
			const name = ch?.name ? `#${ch.name}` : (channelsMap[id]?.nickname || 'Channel')
			const subtitle = g?.name || 'Direct Message'
			return { id, name, subtitle }
		})

		actions.openLazy(
			Promise.resolve({
				default: () => {
					const {
						ActionSheet,
						BottomSheetTitleHeader,
						ActionSheetCloseButton,
						TableRowGroup,
						TableRow,
						Stack,
					} = valenced.discord.design.Design as any
					const { TableRowAssetIcon } = (valenced.components ?? {}) as any

					return (
						<ActionSheet
							header={
								<BottomSheetTitleHeader
									title="Favorites"
									trailing={
										<ActionSheetCloseButton
											onPress={() => actions.hideActionSheet()}
										/>
									}
								/>
							}
						>
							<Stack spacing={8} style={{ padding: 16 }}>
								<TableRowGroup>
									<TableRow
										key="@favorites"
										icon={
											TableRowAssetIcon ? (
												<TableRowAssetIcon name="StarIcon" />
											) : undefined
										}
										label="Built-in Favorites"
										subLabel="Open Discord Favorites Server"
										onPress={() => {
											actions.hideActionSheet()
											navigateToBuiltinFavorites(storage)
										}}
									/>
									{items.map(item => (
										<TableRow
											key={item.id}
											icon={
												TableRowAssetIcon ? (
													<TableRowAssetIcon name="ChannelsIcon" />
												) : undefined
											}
											label={item.name}
											subLabel={item.subtitle}
											onPress={() => {
												actions.hideActionSheet()
												navigateToChannel(item.id)
											}}
										/>
									))}
								</TableRowGroup>
							</Stack>
						</ActionSheet>
					)
				},
			}),
			'youbar-favorites-picker',
			{},
		)
	} catch (e) {
		console.error('[YouBar+] Favorites sheet error:', e)
	}
}

function handleFavoritesButtonPress(storage?: JsonStorage<YouBarPlusStorage>) {
	try {
		const now = Date.now()
		const router = getTransitionRouter(storage)
		const guildStore = valenced.modules.finders.lookupModule(
			valenced.modules.finders.filters.withProps(
				'getGuildId',
				'getLastSelectedGuildId',
			),
		)?.[0]
		const currentGuildId = guildStore?.getGuildId()
		const isCurrentlyInFavorites = currentGuildId === '@favorites'

		const doubleTapEnabled = getYouBarStorage().doubleTapReturn !== false
		const isDoubleTap = doubleTapEnabled && now - lastFavoritesTapTime < 500

		if (isDoubleTap && isCurrentlyInFavorites) {
			const target = lastSavedNonFavoritesLocation || getCurrentNonDmLocation()
			if (target?.guildId && target.guildId !== '@favorites') {
				router?.transitionToGuild?.(target.guildId, target.channelId)
				lastFavoritesTapTime = 0
				return
			}
		}

		if (!isCurrentlyInFavorites && currentGuildId && currentGuildId !== '@favorites') {
			const currentChannel = getCurrentNonDmLocation()?.channelId
			lastSavedNonFavoritesLocation = {
				guildId: currentGuildId,
				channelId: currentChannel,
			}
		}

		lastFavoritesTapTime = now
		if (navigateToBuiltinFavorites(storage)) {
			return
		}

		openFavoritesActionSheet(storage)
	} catch (e) {
		console.error('[YouBar+] Favorites button error:', e)
	}
}

export default function patchYouBarButtons(
	storage: JsonStorage<YouBarPlusStorage>,
): () => void {
	const cleanups: Array<() => void> = []
	const patchedButtonTargets = new WeakSet<object>()
	const React = valenced.react.React

	const unsubStorage = storage.subscribe(() => {
		requestYouBarUpdate()
	})
	cleanups.push(() => unsubStorage?.())

	const applyPatch = (targetModule: any, id?: number) => {
		const component =
			targetModule?.YouBarNotificationsButton ??
			targetModule?.default ??
			targetModule

		if (
			!component ||
			(typeof component !== 'function' && typeof component !== 'object')
		)
			return
		if (patchedButtonTargets.has(component)) return
		patchedButtonTargets.add(component)

		const isMemo = typeof component.type === 'function'
		const target = isMemo
			? component
			: typeof targetModule?.default === 'function'
				? targetModule
				: component
		const prop = isMemo
			? 'type'
			: typeof targetModule?.default === 'function'
				? 'default'
				: 'type'

		const unpatch = valenced.patcher.instead(
			target,
			prop,
			(args: any[], OriginalRender: any) => {
				const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0)

				React.useEffect(() => {
					updateCallbacks.push(forceUpdate)
					return () => {
						updateCallbacks = updateCallbacks.filter(cb => cb !== forceUpdate)
					}
				}, [])

				const res = OriginalRender(...args)
				if (!res) return res

				const rawCache = getYouBarStorage()
				const currentStorage: YouBarPlusStorage = {
					...DEFAULT_STORAGE,
					...rawCache,
					order: getNormalizedOrder(rawCache),
				}

				const targetElement = res.props?.children ?? res
				const DesignIconButton = valenced.discord?.design?.Design?.IconButton
				const IconButton =
					typeof targetElement?.type === 'function' ||
					typeof targetElement?.type === 'object'
						? targetElement.type
						: DesignIconButton
				const originalProps = targetElement?.props ?? res?.props ?? {}

				let SettingsIcon: any
				let ChatIcon: any
				let StarIcon: any
				try {
					SettingsIcon =
						valenced.assets.getAssetIdByName('SettingsIcon') ??
						valenced.assets.getAssetIdByName('ic_settings')
					ChatIcon =
						valenced.assets.getAssetIdByName('ChatIcon') ??
						valenced.assets.getAssetIdByName('ic_chat')
					StarIcon =
						valenced.assets.getAssetIdByName('StarIcon') ??
						valenced.assets.getAssetIdByName('ic_star') ??
						valenced.assets.getAssetIdByName('ic_bookmark')
				} catch {}

				if (!IconButton) return res

				const dmButton =
					currentStorage.showDMButton !== false
						? React.createElement(IconButton, {
								key: 'youbar-dm-button',
								variant: originalProps.variant || 'tertiary',
								size: originalProps.size || 'sm',
								icon: ChatIcon,
								accessibilityLabel: 'Direct Messages',
								onPress: () => {
									handleDmButtonPress(storage)
								},
							})
						: null

				const settingsButton =
					currentStorage.showSettingsButton !== false
						? React.createElement(IconButton, {
								key: 'youbar-settings-button',
								variant: originalProps.variant || 'tertiary',
								size: originalProps.size || 'sm',
								icon: SettingsIcon,
								accessibilityLabel: 'User Settings',
								onPress: () => {
									try {
										handleSettingsButtonPress(storage)
									} catch (e) {
										console.error('[YouBar+] Settings button error:', e)
									}
								},
							})
						: null

				const favoritesButton =
					currentStorage.showFavoritesButton
						? React.createElement(IconButton, {
								key: 'youbar-favorites-button',
								variant: originalProps.variant || 'tertiary',
								size: originalProps.size || 'sm',
								icon: StarIcon,
								accessibilityLabel: 'Favorites',
								onPress: () => {
									handleFavoritesButtonPress(storage)
								},
								onLongPress: () => {
									openFavoritesActionSheet(storage)
								},
							})
						: null

				const notificationsButton =
					currentStorage.showNotificationsButton !== false ? res : null

				const order = getActiveButtons(currentStorage)

				const buttonMap: Record<string, any> = {
					dms: dmButton,
					notifications: notificationsButton,
					settings: settingsButton,
					favorites: favoritesButton,
				}

				const renderedButtons = order.map(id => buttonMap[id]).filter(Boolean)

				if (renderedButtons.length === 0) return res

				const RN = valenced.react.ReactNative

				return React.createElement(
					RN?.View ?? React.Fragment,
					RN?.View
						? {
								style: {
									flexDirection: 'row',
									alignItems: 'center',
									justifyContent: 'flex-end',
									gap: 4,
								},
							}
						: null,
					...renderedButtons,
				)
			},
		)

		cleanups.push(unpatch)
	}

	try {
		const imported = findByImportedPath(
			'modules/main_tabs_v2/native/you_bar/YouBarNotificationsButton.tsx',
		)
		if (imported) applyPatch(imported)

		const unsubPath = waitForImportedPath(
			'modules/main_tabs_v2/native/you_bar/YouBarNotificationsButton.tsx',
			(m, id) => {
				if (m) applyPatch(m, id)
			},
		)
		if (unsubPath) cleanups.push(unsubPath)

		try {
			const unsubSettings = waitForImportedPath(
				'modules/user_settings/core/native/openUserSettings.tsx',
				m => {
					const target = (m as any)?.default ?? m
					if (typeof target?.openUserSettings === 'function') {
						cachedUserSettingsRouter = target
					}
				},
			)
			if (unsubSettings) cleanups.push(unsubSettings)

			const unsubNav = waitForImportedPath(
				'modules/main_tabs_v2/RootNavigationRef.native.tsx',
				m => {
					const target = (m as any)?.default ?? m
					if (typeof target?.getRootNavigationRef === 'function') {
						cachedRootNavigationRef = target
					}
				},
			)
			if (unsubNav) cleanups.push(unsubNav)
		} catch {}
	} catch (e) {
		console.error('[YouBar+] Error finding YouBarNotificationsButton:', e)
	}

	return () => {
		for (const fn of cleanups) {
			try {
				fn()
			} catch {}
		}
	}
}
