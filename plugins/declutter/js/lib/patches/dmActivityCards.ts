import { onImportedPath, safeInstead } from '../modules'
import { getSettings } from '../state'
import type { PluginCleanupApi } from '@valenced/plugins/types'
import type { ReactNode } from 'react'

interface ActivityCardsModule {
	default: { type: (...args: unknown[]) => ReactNode }
	getMessagesItemHappeningNowHeight: (...args: unknown[]) => number
}

export function patchDmActivityCards(cleanup: PluginCleanupApi): void {
	cleanup(
		onImportedPath(
			'modules/main_tabs_v2/native/tabs/messages/items/MessagesItemHappeningNow.tsx',
			(ns: ActivityCardsModule) => {
				cleanup(
					safeInstead(
						ns.default,
						'type',
						function (this: unknown, args, original) {
							const result = Reflect.apply(original, this, args)
							return getSettings().dmActivityCards ? null : result
						},
					),
					safeInstead(
						ns,
						'getMessagesItemHappeningNowHeight',
						function (this: unknown, args, original) {
							const height = Reflect.apply(original, this, args)
							return getSettings().dmActivityCards ? 0 : height
						},
					),
				)
			},
		),
	)
}
