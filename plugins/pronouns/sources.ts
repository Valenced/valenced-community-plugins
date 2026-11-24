import { getStore, Stores } from '@valenced/discord/flux'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { reportError, settings } from './shared'
import { cleanPronounDb, cleanPronouns, tidy } from './validate'
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

	const unsubStore = getStore<UserProfileStore>('UserProfileStore', found => {
		store = found
		found.addChangeListener(changed)
		changed()
	})

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
		queue.length = 0
		queued.clear()
		busy = false
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

// One profile request at a time, spaced out, so a busy channel can't flood Discord
const GAP_MS = 150
const RETRY_MS = 5_000
const FETCH_TIMEOUT_MS = 8_000
const MAX_TRIES = 2

interface Job {
	userId: string
	guildId?: string
	tries: number
}

const queue: Job[] = []
const queued = new Set<string>()
let busy = false
let timer: ReturnType<typeof setTimeout> | undefined

const keyOf = (job: Job) => `${job.userId}:${job.guildId ?? ''}`

function later(fn: () => void, delay: number) {
	clearTimeout(timer)
	timer = setTimeout(fn, delay)
}

function pump() {
	if (busy || !fetchProfile) return
	const job = queue.shift()
	if (!job) return
	if (loaded(job.userId, job.guildId)) {
		queued.delete(keyOf(job))
		later(pump, 0)
		return
	}

	busy = true
	job.tries++
	let settled = false
	const finish = (ok: boolean) => {
		if (settled) return
		settled = true
		clearTimeout(timeout)
		busy = false
		if (ok || job.tries >= MAX_TRIES) queued.delete(keyOf(job))
		else setTimeout(() => queue.push(job), RETRY_MS)
		later(pump, GAP_MS)
	}
	// A request that never settles would otherwise block the queue
	const timeout = setTimeout(() => finish(false), FETCH_TIMEOUT_MS)
	try {
		const result = fetchProfile(
			job.userId,
			job.guildId ? { guildId: job.guildId } : undefined,
		)
		if (result instanceof Promise)
			result.then(
				() => finish(true),
				() => finish(false),
			)
		else finish(true)
	} catch (error) {
		reportError('profile fetch failed', error)
		finish(false)
	}
}

function fetchOnMiss(userId: string, guildId?: string) {
	const job: Job = { userId, guildId, tries: 0 }
	const key = keyOf(job)
	if (queued.has(key) || loaded(userId, guildId)) return
	queued.add(key)
	queue.push(job)
	pump()
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
// Bumped by stop, so a flush that was mid-batch doesn't start another
let generation = 0

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
	const started = generation
	dbTimer = undefined
	flushing = true
	try {
		const ids = [...pending]
		pending.clear()
		let resolved = false
		for (let i = 0; i < ids.length; i += BATCH) {
			const chunk = ids.slice(i, i + BATCH)
			const data = await fetchBatch(chunk)
			if (started !== generation) return
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
		if (started === generation && pending.size && dbTimer === undefined)
			dbTimer = setTimeout(flush, DEBOUNCE_MS)
	}
}

export function stopPronounDb() {
	generation++
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
	const options = { anyAll: s.allowAnyAll }
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
