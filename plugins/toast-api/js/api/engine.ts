import { reportError } from '../lib/errors'
import { getSettings } from '../lib/settings'
import { getEntries, setEntries } from './store'
import type { ToastApiSettings, ToastEntry, ToastInput } from '../types'

let seq = 0
const timers = new Map<string, number>()

function clearTimer(id: string): void {
	const handle = timers.get(id)
	if (handle !== undefined) {
		clearTimeout(handle)
		timers.delete(id)
	}
}

function deriveKey(input: ToastInput, allocate: () => number): string {
	if (typeof input.key === 'string' && input.key.length > 0) return input.key
	if (typeof input.content === 'string') return `text:${input.content}`
	return `auto:${allocate()}`
}

function resolveDurationMs(
	input: ToastInput,
	s: ToastApiSettings = getSettings(),
): number {
	let base: number
	if (s.durationMode === 'override') base = s.overrideDurationMs
	else if (s.durationMode === 'default') base = s.defaultDurationMs
	else base = input.duration ?? s.defaultDurationMs
	if (s.minDurationMs > 0 && base < s.minDurationMs) base = s.minDurationMs
	if (s.maxDurationMs > 0 && base > s.maxDurationMs) base = s.maxDurationMs
	return Math.max(0, base)
}

function arm(entry: ToastEntry): void {
	clearTimer(entry.id)
	if (!(entry.durationMs > 0)) return
	const handle = setTimeout(() => {
		timers.delete(entry.id)
		closeId(entry.id)
	}, entry.durationMs)
	timers.set(entry.id, handle)
}

function removeAt(index: number): void {
	const current = getEntries()
	const entry = current[index]
	if (!entry) return
	clearTimer(entry.id)
	setEntries(current.filter((_, i) => i !== index))
	try {
		entry.onDismiss?.()
	} catch (error) {
		reportError(error)
	}
}

function closeId(id: string): void {
	const index = getEntries().findIndex(entry => entry.id === id)
	if (index >= 0) removeAt(index)
}

/** Build a toast entry without adding it to the store or starting its timer. */
export function buildEntry(
	input: ToastInput,
	handle: { id: string; key: string },
): ToastEntry {
	const s = getSettings()
	return {
		...input,
		id: handle.id,
		key: handle.key,
		content: input.content,
		variant: input.variant ?? 'default',
		durationMs: resolveDurationMs(input, s),
		position: input.position ?? s.position,
		createdAt: Date.now(),
	}
}

/** Show a toast, returning its id (or the id of an existing duplicate). */
export function show(input: ToastInput | string): string {
	if (typeof input === 'string') input = { content: input }
	const key = deriveKey(input, () => ++seq)
	const existing = getEntries().find(entry => entry.key === key)
	if (existing) return existing.id

	const entry = buildEntry(input, { id: `toast-${++seq}`, key })

	const next = [...getEntries(), entry]
	const cap = getSettings().maxVisible
	while (cap > 0 && next.length > cap) {
		const dropped = next.shift()
		if (dropped) clearTimer(dropped.id)
	}

	setEntries(next)
	arm(entry)
	return entry.id
}

/** Update a visible toast. Re-arm its timer only when `duration` changes. */
export function update(id: string, patch: Partial<ToastInput>): boolean {
	const current = getEntries()
	const index = current.findIndex(entry => entry.id === id)
	if (index < 0) return false
	const previous = current[index]
	const rearm =
		patch.duration !== undefined && patch.duration !== previous.duration
	const merged: ToastEntry = {
		...previous,
		...patch,
		id: previous.id,
		key: previous.key,
		position: patch.position ?? previous.position,
		durationMs: rearm
			? resolveDurationMs({ ...previous, ...patch })
			: previous.durationMs,
	}
	const changed = Object.keys(patch).some(
		key =>
			!Object.is(
				previous[key as keyof ToastEntry],
				merged[key as keyof ToastEntry],
			),
	)
	if (!changed) return true
	const next = [...current]
	next[index] = merged
	setEntries(next)
	if (rearm) arm(merged)
	return true
}

/** Close one toast, or all toasts when no id is given. */
export function close(id?: string): void {
	if (id == null) {
		closeAll()
		return
	}
	const index = getEntries().findIndex(entry => entry.id === id)
	if (index >= 0) removeAt(index)
}

export function closeAll(): void {
	const current = getEntries()
	for (const entry of current) clearTimer(entry.id)
	setEntries([])
	for (const entry of current) {
		try {
			entry.onDismiss?.()
		} catch (error) {
			reportError(error)
		}
	}
}

/** Close the newest toast. */
export function pop(): void {
	const index = getEntries().length - 1
	if (index >= 0) removeAt(index)
}

export function list(): ToastEntry[] {
	return getEntries()
}

/** Clear all entries and timers without calling `onDismiss`. */
export function clearAll(): void {
	for (const handle of timers.values()) clearTimeout(handle)
	timers.clear()
	setEntries([])
}
