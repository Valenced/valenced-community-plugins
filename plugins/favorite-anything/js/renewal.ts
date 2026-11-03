/*!
 * Copyright (c) 2026 Zakaria Hamdaoui
 * Licensed under the MIT License. See the LICENSE file in the project root.
 * SPDX-License-Identifier: MIT
 */

import { baseOf, isSigned, isStale, withFreshSignature } from './urls'

export interface RefreshResponse {
	body?: {
		refreshed_urls?: Array<{ original?: string; refreshed?: string | null }>
	}
}

export type RefreshRequest = (
	urls: string[],
) => Promise<RefreshResponse | undefined> | undefined

export interface SignedUrlsOptions {
	request: RefreshRequest
	onRenewed(): void
	onError(error: unknown): void
}

export interface SignedUrls {
	resolve(url: string): string
	version(): number
	stop(): void
}

const BatchSize = 50
const FlushDelayMs = 50
const CooldownMs = 300_000
const MaxQueued = 500

export function createSignedUrls({
	request,
	onRenewed,
	onError,
}: SignedUrlsOptions): SignedUrls {
	const renewed = new Map<string, string>()
	const cooldown = new Map<string, number>()
	const queue = new Set<string>()
	let queuedTotal = 0
	let timer: number | undefined
	let flushing = false
	let stopped = false
	let version = 0

	function failBatch(keys: string[]) {
		for (const key of keys) cooldown.set(key, Date.now() + CooldownMs)
	}

	async function flush() {
		timer = undefined
		if (flushing || stopped) return

		flushing = true
		try {
			while (queue.size && !stopped) {
				const chunk = Array.from(queue).slice(0, BatchSize)
				for (const key of chunk) queue.delete(key)

				try {
					const response = await request(chunk)
					if (!response) {
						failBatch(chunk)
						continue
					}

					for (const item of response.body?.refreshed_urls ?? [])
						if (item.original && item.refreshed)
							renewed.set(item.original, item.refreshed)

					failBatch(
						chunk.filter(key => {
							const fresh = renewed.get(key)
							return !fresh || isStale(fresh)
						}),
					)
				} catch (error) {
					failBatch(chunk)
					onError(error)
				}
			}
		} finally {
			flushing = false
			if (!stopped) {
				version++
				onRenewed()
			}
		}
	}

	function enqueue(key: string) {
		if (queue.has(key) || queuedTotal >= MaxQueued) return
		if ((cooldown.get(key) ?? 0) > Date.now()) return

		queue.add(key)
		queuedTotal++
		if (timer === undefined && !flushing)
			timer = setTimeout(flush, FlushDelayMs)
	}

	return {
		resolve(url) {
			if (stopped || !isSigned(url) || !isStale(url)) return url

			const key = baseOf(url)
			const fresh = renewed.get(key)
			if (fresh && !isStale(fresh)) return withFreshSignature(fresh, url)

			enqueue(key)
			return url
		},
		version: () => version,
		stop() {
			stopped = true
			if (timer !== undefined) clearTimeout(timer)
			timer = undefined
			renewed.clear()
			cooldown.clear()
			queue.clear()
		},
	}
}
