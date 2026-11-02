import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { createElement } from 'react'
import { TabBar } from './bar'
import { fadeTabScreens, swapRender, withTabBar } from './screens'
import SettingsComponent from './settings'
import { DEFAULT_SETTINGS, found } from './state'
import type { ReactNode } from 'react'
import type { Badge, RootRef, Storage } from './state'

// Read from the Hermes bundle of Discord 352.6 Alpha. Notes are in
// docs/DEVELOPMENT.md, task 2.
//
// 352.6 has no tab navigator left. TabsNavigator.tsx (still in 329.13) is gone,
// and the Tabs V2 / You Tab experiments are not in the bundle. Navigation is:
//
//   root stack
//     main (MainNavigator)
//       tabs (MainTabs)
//         YouBarStackNavigator: guilds | icymi | notifications
//     you        <- RootNavigatorScreen.YOU (YouScreen)
//     settings   <- RootNavigatorScreen.SETTINGS (Settings > SettingsNavigator)
//
// The You bar (memo(YouBarThemed), you_bar/YouBar.tsx) floats over `guilds`.
// Its avatar opens `you`, its bell pushes `notifications`. Screens leave
// useYouBarTotalHeight() (56 + bottom inset) free at the bottom, so a docked
// bar of the same height fits without moving any list.
//
// The bar replaces the You bar on `guilds`, and is drawn under the
// Notifications, You, and Settings screens so it stays put on every tab.
//
// The code lives in:
//   state.ts       settings shape, found modules, settings hooks
//   bar.tsx        the docked bar, icons, styles, badges
//   screens.tsx    screen patches: render rewriting, bar docking, fades
//   navigation.ts  tab switching through the root navigation ref
//   settings.tsx   the plugin settings page

const BASE = 'modules/main_tabs_v2/'

export default plugin({
	jsonStorage: {
		load: true,
		default: DEFAULT_SETTINGS,
	},
	start({ cleanup, logger, jsonStorage }) {
		logger.log('NoYouBar started')
		found.storage = jsonStorage as unknown as Storage

		const undoScreens = fadeTabScreens(logger)
		cleanup(
			() => {
				found.storage = undefined
			},
			...undoScreens,
			getModuleWithImportedPath(
				`${BASE}RootNavigationRef.native.tsx`,
				exports => {
					const mod = exports as { getRootNavigationRef?: () => RootRef }
					found.root = () => mod.getRootNavigationRef?.()
				},
			),
			getModuleWithImportedPath(
				`${BASE}native/tabs/notifications/useNotificationsTabBadge.tsx`,
				exports => {
					found.badge = (exports as { default?: () => Badge }).default
				},
			),
			getModuleWithImportedPath(`${BASE}native/you_bar/YouBar.tsx`, exports => {
				const undo = swapRender(exports, 'YouBarThemed', logger, out =>
					createElement(TabBar, {
						active: 'home',
						fallback: out as ReactNode,
					}),
				)
				if (undo) cleanup(undo)
			}),
			getModuleWithImportedPath(
				`${BASE}native/tabs/notifications/Notifications.tsx`,
				exports => {
					const undo = withTabBar(exports, 'notifications', logger)
					if (undo) cleanup(undo)
				},
			),
			getModuleWithImportedPath(
				`${BASE}native/tabs/you/YouScreen.tsx`,
				exports => {
					const undo = withTabBar(exports, 'profile', logger)
					if (undo) cleanup(undo)
				},
			),
			getModuleWithImportedPath(
				`${BASE}native/tabs/settings/Settings.tsx`,
				exports => {
					const undo = withTabBar(exports, 'settings', logger)
					if (undo) cleanup(undo)
				},
			),
		)
	},
	stop({ logger }) {
		this.requireReload()
		logger.log('NoYouBar stopped')
	},
	SettingsComponent,
})
