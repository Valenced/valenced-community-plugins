// FavoriteAnything - by @TheUnrealZaka
// Ported from the Equicord desktop plugin (nin0dev & davri)
// Patches GIFFavButton so the star shows on all media, not just GIFs.

/*!
 * Copyright (c) 2026 Zakaria Hamdaoui
 * Licensed under the MIT License. See the LICENSE file in the project root.
 * SPDX-License-Identifier: MIT
 */

import { getModules } from '@valenced/modules/finders'
import {
	createFilterGenerator,
	withProps,
} from '@valenced/modules/finders/filters'
import { after, before } from '@valenced/patcher'
import { useReRender } from '@valenced/utils/react'
import { useEffect, useMemo } from 'react'
import { asGifvSource, createFavoritesMapper, normalizeSave } from './items'
import { createSignedUrls } from './renewal'
import type {
	Filter,
	FilterGenerator,
	FilterScopes,
} from '@valenced/modules/finders/filters'
import type { FC, MemoExoticComponent } from 'react'
import type { ButtonSource, FavoriteGif } from './items'
import type { RefreshResponse } from './renewal'

const ButtonName = 'GIFFavButton'
const FallbackRefreshEndpoint = '/attachments/refresh-urls'

interface ButtonProps {
	source?: ButtonSource
	[key: string]: unknown
}

interface FavoriteGifActions {
	addFavoriteGIF(data: FavoriteGif, ...rest: unknown[]): unknown
}

interface FavoritesResult {
	favorites?: FavoriteGif[]
	[key: string]: unknown
}

interface FavoriteGifHooks {
	useFavoriteGIFsMobile(...args: unknown[]): FavoritesResult
}

interface HTTP {
	post(options: {
		url: string
		body?: unknown
		retries?: number
	}): Promise<RefreshResponse>
}

interface Endpoints {
	ATTACHMENTS_REFRESH_URLS?: string
}

type ButtonMemo = MemoExoticComponent<FC<ButtonProps>>

let stopped = true
const patchedHooks = new WeakSet<object>()
let mapFavorites: ReturnType<typeof createFavoritesMapper> | undefined
const listeners = new Set<() => void>()

function isNamedMemo(value: any): value is ButtonMemo {
	return (
		typeof value?.type === 'function' &&
		(value.type.displayName ?? value.type.name) === ButtonName
	)
}

type WithButtonMemo = FilterGenerator<
	() => Filter<{
		Result: ButtonMemo
		Scopes: [typeof FilterScopes.Initialized]
	}>
>

const withButtonMemo = createFilterGenerator(
	(_, __, exports) => isNamedMemo(exports),
	() => `memoizedComponentNamed(${ButtonName})`,
) as WithButtonMemo

function patchPicker(hooks: FavoriteGifHooks) {
	if (patchedHooks.has(hooks)) return
	patchedHooks.add(hooks)

	after(hooks, 'useFavoriteGIFsMobile', result => {
		const rerender = useReRender()

		useEffect(() => {
			listeners.add(rerender)
			return () => {
				listeners.delete(rerender)
			}
		}, [rerender])

		const favorites = result?.favorites
		const mapped =
			!stopped && mapFavorites && Array.isArray(favorites)
				? mapFavorites(favorites)
				: favorites

		return useMemo(
			() => (mapped === favorites ? result : { ...result, favorites: mapped }),
			[result, mapped],
		)
	})
}

export default plugin({
	start({ cleanup, plugin }) {
		stopped = false

		let http: HTTP | undefined
		let endpoint = FallbackRefreshEndpoint
		let reported = false

		const urls = createSignedUrls({
			request: batch =>
				http?.post({
					url: endpoint,
					body: { attachment_urls: batch },
					retries: 3,
				}),
			onRenewed() {
				for (const rerender of listeners) rerender()
			},
			onError(error) {
				if (reported) return

				reported = true
				plugin.reportError(error)
			},
		})

		mapFavorites = createFavoritesMapper(urls.resolve, urls.version)

		cleanup(
			() => {
				urls.stop()
			},

			getModules(withProps<{ HTTP: HTTP }>('HTTP'), exports => {
				http = exports.HTTP
			}),

			getModules(withProps<{ Endpoints: Endpoints }>('Endpoints'), exports => {
				endpoint =
					exports.Endpoints.ATTACHMENTS_REFRESH_URLS ?? FallbackRefreshEndpoint
			}),

			getModules(withProps<FavoriteGifActions>('addFavoriteGIF'), actions => {
				cleanup(
					before(actions, 'addFavoriteGIF', args => {
						const [data] = args
						if (data && typeof data === 'object') args[0] = normalizeSave(data)

						return args
					}),
				)
			}),

			getModules(
				withProps<FavoriteGifHooks>('useFavoriteGIFsMobile'),
				patchPicker,
			),

			getModules(withButtonMemo(), exports => {
				cleanup(
					before(exports, 'type', args => {
						const [props] = args
						const source = props?.source

						if (source && typeof source === 'object' && !source.isGIFV)
							args[0] = { ...props, source: asGifvSource(source) }

						return args
					}),
				)
			}),
		)
	},
	stop() {
		stopped = true
		for (const rerender of listeners) rerender()
	},
})
