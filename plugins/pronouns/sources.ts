import { getStore, Stores } from '@valenced/discord/flux'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { reportError, settings } from './shared'
import { cleanPronounDb, cleanPronouns, parseExtra, tidy } from './validate'
import type { DiscordModules } from '@valenced/discord/types'

interface UserProfileStore {
	getUserProfile(userId: string): { pronouns?: string } | undefined
	getGuildMemberProfile(
		userId: string,
		guildId: string,
	): { pronouns?: string } | undefined
}

interface UserActionCreators {
	fetchProfile(userId: string, options?: { guildId?: string }): unknown
	fetchCurrentUser(): unknown
}

interface UserStore {
	getUser(
		id: string,
	): { username: string; globalName?: string | null } | undefined
}

let store: UserProfileStore | undefined
let fetchProfile: UserActionCreators['fetchProfile'] | undefined
const profileListeners = new Set<() => void>()

export function watchDiscord() {
	let active = true
	const changed = () => {
		if (active) for (const listener of profileListeners) listener()
	}

	// modules/user_profile/UserProfileStore.tsx
	const unsubStore = getStore<UserProfileStore>('UserProfileStore', found => {
		store = found
		found.addChangeListener(changed)
		changed()
	})

	// actions/UserActionCreators.tsx
	const unsubActions = getModules(
		withProps<UserActionCreators>('fetchProfile', 'fetchCurrentUser'),
		exports => {
			const fn =
				exports.fetchProfile ??
				(exports as { default?: UserActionCreators }).default?.fetchProfile
			if (typeof fn === 'function') {
				fetchProfile = fn
				pump()
			}
		},
	)

	return () => {
		active = false
		unsubStore()
		unsubActions()
		store = undefined
		fetchProfile = undefined
		jobs.clear()
		inFlight = 0
		clearTimeout(timer)
		timer = undefined
	}
}

export function onProfileChange(listener: () => void) {
	profileListeners.add(listener)
	return () => profileListeners.delete(listener)
}

function discordPronouns(userId: string, guildId?: string) {
	if (!store) return undefined
	const guild = guildId
		? tidy(store.getGuildMemberProfile(userId, guildId)?.pronouns)
		: undefined
	return guild ?? tidy(store.getUserProfile(userId)?.pronouns)
}

export function nameOf(id: string) {
	const UserStore = Stores.UserStore as DiscordModules.Flux.Store<UserStore>
	const user = UserStore.getUser(id)
	return user?.globalName || user?.username || `User ${id}`
}

// Discord loads your own server profile early without your account profile, so check both
function loaded(userId: string, guildId?: string) {
	if (!store) return false
	const user = !!store.getUserProfile(userId)
	if (!guildId) return user
	const member = store.getGuildMemberProfile(userId, guildId)
	return !!member && (!!tidy(member.pronouns) || user)
}

// Profile fetches are paced so a busy channel doesn't hit Discord's rate limit
const GAP_MS = 150
const MAX_IN_FLIGHT = 3
const FETCH_TIMEOUT_MS = 8_000
const MAX_TRIES = 4
const RETRY_MS = [5_000, 30_000, 120_000]

interface Job {
	userId: string
	guildId?: string
	tries: number
	notBefore: number
	done: boolean
	running: boolean
}

const jobs = new Map<string, Job>()
let inFlight = 0
let timer: ReturnType<typeof setTimeout> | undefined

function schedule(delay: number) {
	if (timer !== undefined) return
	timer = setTimeout(() => {
		timer = undefined
		pump()
	}, delay)
}

function nextJob(now: number) {
	let soonest = Number.POSITIVE_INFINITY
	const all = [...jobs.values()]
	for (let i = all.length - 1; i >= 0; i--) {
		const job = all[i]
		if (!job || job.done || job.running) continue
		if (loaded(job.userId, job.guildId)) {
			job.done = true
			continue
		}
		if (job.notBefore <= now) return { job, soonest }
		soonest = Math.min(soonest, job.notBefore)
	}
	return { soonest }
}

function pump() {
	if (inFlight >= MAX_IN_FLIGHT || !fetchProfile) return
	const now = Date.now()
	const { job, soonest } = nextJob(now)
	if (!job) {
		if (soonest !== Number.POSITIVE_INFINITY) schedule(soonest - now)
		return
	}
	inFlight++
	job.running = true
	job.tries++
	let settled = false
	const finish = (ok: boolean, retryAfterMs = 0) => {
		if (settled) return
		settled = true
		clearTimeout(timeout)
		inFlight--
		job.running = false
		if (ok || loaded(job.userId, job.guildId) || job.tries >= MAX_TRIES) {
			job.done = true
		} else {
			const backoff = RETRY_MS[Math.min(job.tries, RETRY_MS.length) - 1] ?? 0
			job.notBefore = Date.now() + Math.max(retryAfterMs, backoff)
		}
		schedule(GAP_MS)
	}
	// A request that never settles would otherwise hold its slot forever
	const timeout = setTimeout(() => finish(false), FETCH_TIMEOUT_MS)
	try {
		const result = fetchProfile(
			job.userId,
			job.guildId ? { guildId: job.guildId } : undefined,
		)
		if (result instanceof Promise) {
			result.then(
				() => finish(true),
				(error?: { body?: { retry_after?: number } }) => {
					const retryAfter = Number(error?.body?.retry_after)
					finish(false, Number.isFinite(retryAfter) ? retryAfter * 1000 : 0)
				},
			)
		} else finish(true)
	} catch (error) {
		reportError('profile fetch failed', error)
		finish(false)
	}
	if (inFlight < MAX_IN_FLIGHT) schedule(GAP_MS)
}

function fetchOnMiss(userId: string, guildId?: string) {
	const key = `${userId}:${guildId ?? ''}`
	const existing = jobs.get(key)
	if (existing) {
		if (!existing.done && !existing.running && existing.tries === 0) {
			jobs.delete(key)
			jobs.set(key, existing)
		}
		return
	}
	if (loaded(userId, guildId)) return
	jobs.set(key, {
		userId,
		guildId,
		tries: 0,
		notBefore: 0,
		done: false,
		running: false,
	})
	schedule(0)
}

// https://pronoundb.org/wiki/api-docs
const PRONOUNDB_API =
	'https://pronoundb.org/api/v2/lookup?platform=discord&ids='
const BATCH = 50
const DEBOUNCE_MS = 150
const PRONOUNDB_TIMEOUT_MS = 10_000
const TTL_MS = 60 * 60 * 1000
const FAILED_RETRY_MS = 30_000
const MAX_ENTRIES = 2_000

const cache = new Map<string, { text?: string; at: number }>()
const pending = new Set<string>()
const retryAt = new Map<string, number>()
const requests = new Set<AbortController>()
const resolvedListeners = new Set<() => void>()
let dbTimer: ReturnType<typeof setTimeout> | undefined
let flushing = false

function cap(map: Map<string, unknown>) {
	while (map.size > MAX_ENTRIES) map.delete(map.keys().next().value as string)
}

function cachedPronounDb(userId: string) {
	const entry = cache.get(userId)
	if (entry && Date.now() - entry.at > TTL_MS) cache.delete(userId)
	else return entry?.text
}

function requestPronounDb(userId: string) {
	if (cachedPronounDb(userId) !== undefined || cache.has(userId)) return
	if (pending.has(userId) || Date.now() < (retryAt.get(userId) ?? 0)) return
	pending.add(userId)
	if (flushing) return
	clearTimeout(dbTimer)
	dbTimer = setTimeout(flush, DEBOUNCE_MS)
}

export function onResolved(listener: () => void) {
	resolvedListeners.add(listener)
	return () => resolvedListeners.delete(listener)
}

async function fetchBatch(ids: string[]) {
	const controller = new AbortController()
	requests.add(controller)
	const timeout = setTimeout(() => controller.abort(), PRONOUNDB_TIMEOUT_MS)
	try {
		const response = await fetch(`${PRONOUNDB_API}${ids.join(',')}`, {
			signal: controller.signal,
			headers: {
				'User-Agent': 'bleelblep/pronouns (Valenced)',
				'X-PronounDB-Source': 'bleelblep/pronouns (Valenced)',
			},
		})
		if (!response.ok) return undefined
		return (await response.json()) as Record<
			string,
			{ sets?: Record<string, string[]> } | undefined
		>
	} catch (error) {
		if (!(error instanceof Error && error.name === 'AbortError'))
			reportError('PronounDB request failed', error)
		return undefined
	} finally {
		clearTimeout(timeout)
		requests.delete(controller)
	}
}

async function flush() {
	dbTimer = undefined
	flushing = true
	try {
		const ids = [...pending]
		pending.clear()
		let resolved = false
		for (let i = 0; i < ids.length; i += BATCH) {
			const chunk = ids.slice(i, i + BATCH)
			const data = await fetchBatch(chunk)
			if (!data) {
				// A failure isn't "no pronouns"; ask again later
				for (const id of chunk) retryAt.set(id, Date.now() + FAILED_RETRY_MS)
				cap(retryAt)
				continue
			}
			for (const id of chunk) {
				retryAt.delete(id)
				const sets = data[id]?.sets?.en
				cache.set(id, {
					text: Array.isArray(sets) && sets.length ? sets.join('/') : undefined,
					at: Date.now(),
				})
				resolved = true
			}
			cap(cache)
		}
		if (resolved) for (const listener of resolvedListeners) listener()
	} finally {
		flushing = false
		if (pending.size && dbTimer === undefined)
			dbTimer = setTimeout(flush, DEBOUNCE_MS)
	}
}

export function stopPronounDb() {
	clearTimeout(dbTimer)
	dbTimer = undefined
	pending.clear()
	retryAt.clear()
	resolvedListeners.clear()
	for (const controller of requests) controller.abort()
	requests.clear()
}

function overrideFor(userId: string) {
	return tidy(settings().overrides[userId])
}

function filtered(raw: string | undefined, fromPronounDb: boolean) {
	const text = tidy(raw)
	const s = settings()
	if (!text || !s.validOnly) return text
	const options = { anyAll: s.allowAnyAll, extra: parseExtra(s.extraPronouns) }
	return tidy(
		fromPronounDb
			? cleanPronounDb(text, options)
			: cleanPronouns(text, options),
	)
}

export function resolve(userId: string, guildId?: string): string | undefined {
	const override = overrideFor(userId)
	if (override) return override
	const s = settings()
	const discord = filtered(discordPronouns(userId, guildId), false)
	if (!s.pronounDbEnabled) return discord
	const db = filtered(cachedPronounDb(userId), true)
	return s.discordFirst ? (discord ?? db) : (db ?? discord)
}

export function prime(userId: string, guildId?: string) {
	if (overrideFor(userId)) return
	fetchOnMiss(userId, guildId)
	if (settings().pronounDbEnabled && !cachedPronounDb(userId))
		requestPronounDb(userId)
}
