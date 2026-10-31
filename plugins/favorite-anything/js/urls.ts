/*!
 * Copyright (c) 2026 Zakaria Hamdaoui
 * Licensed under the MIT License. See the LICENSE file in the project root.
 * SPDX-License-Identifier: MIT
 */

const SignedRe =
	/^https:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net|images-ext-[12]\.discordapp\.net)\/(?:attachments|ephemeral-attachments|external)\//
const AttachmentRe =
	/^https:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net)\/(?:attachments|ephemeral-attachments)\//
const VideoRe = /\.(?:mp4|webm|mov|m4v|avi|mkv|flv|wmv|gifv)$/i
const ThumbnailRe = /[?&]format=(?:png|jpe?g|webp)(?:&|$)/i
const SignatureRe = /^(?:ex|is|hm)=/
const ParamRe = /^[A-Za-z_]\w*=/
const ExpiryRe = /[?&]ex=([0-9a-f]+)/i

const Cdn = 'cdn.discordapp.com'
const Media = 'media.discordapp.net'

export const ExpiryMarginMs = 3_600_000
const ThumbnailWidth = 480

export function split(
	url: string,
): [base: string, query: string, hash: string] {
	const hashIndex = url.indexOf('#')
	const hash = hashIndex < 0 ? '' : url.slice(hashIndex)
	const rest = hashIndex < 0 ? url : url.slice(0, hashIndex)
	const queryIndex = rest.indexOf('?')

	return queryIndex < 0
		? [rest, '', hash]
		: [rest.slice(0, queryIndex), rest.slice(queryIndex + 1), hash]
}

export const baseOf = (url: string) => split(url)[0]

const paramsOf = (url: string) => split(url)[1].split('&').filter(Boolean)

export const extrasOf = (url: string) =>
	paramsOf(url).filter(p => ParamRe.test(p) && !SignatureRe.test(p))

export const signatureOf = (url: string) =>
	paramsOf(url).filter(p => SignatureRe.test(p))

export function build(base: string, params: string[], hash = '') {
	const seen = new Set<string>()
	const unique = params.filter(param => {
		const key = param.slice(0, param.indexOf('='))
		if (seen.has(key)) return false

		seen.add(key)
		return true
	})

	return base + (unique.length ? `?${unique.join('&')}` : '') + hash
}

export const isSigned = (url: unknown): url is string =>
	typeof url === 'string' && SignedRe.test(url)

export const isAttachment = (url: unknown): url is string =>
	typeof url === 'string' && AttachmentRe.test(url)

export const isVideoFile = (url: unknown): url is string =>
	typeof url === 'string' && VideoRe.test(baseOf(url))

export const isVideoSrc = (url: unknown): url is string =>
	isVideoFile(url) && !ThumbnailRe.test(url)

export function expiryOf(url: string) {
	const match = ExpiryRe.exec(url)
	return match ? Number.parseInt(match[1]!, 16) * 1000 : 0
}

export const isStale = (url: string, now = Date.now()) =>
	expiryOf(url) - ExpiryMarginMs < now

export function withFreshSignature(fresh: string, from: string) {
	const [base, query] = split(fresh)

	return build(
		base,
		[...query.split('&').filter(Boolean), ...extrasOf(from)],
		split(from)[2],
	)
}

export function thumbnailSize(width?: number, height?: number) {
	if (!width || !height || width <= 0 || height <= 0)
		return {
			width: ThumbnailWidth,
			height: Math.round(ThumbnailWidth * 0.5625),
		}

	const scaled = Math.min(width, ThumbnailWidth)
	return {
		width: scaled,
		height: Math.max(1, Math.round((height * scaled) / width)),
	}
}

export function videoThumbnail(src: string, width?: number, height?: number) {
	const [base, , hash] = split(src)
	const size = thumbnailSize(width, height)

	return build(
		base.replace(Cdn, Media),
		[
			...signatureOf(src),
			...extrasOf(src),
			'format=png',
			`width=${size.width}`,
			`height=${size.height}`,
		],
		hash,
	)
}

export function signatureOnly(url: string) {
	const [base, , hash] = split(url)
	return build(base, signatureOf(url), hash)
}
