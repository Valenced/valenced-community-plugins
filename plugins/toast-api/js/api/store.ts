import { reportError } from '../lib/errors'
import type { ToastEntry } from '../types'

let entries: ToastEntry[] = []
const listeners = new Set<() => void>()

export function getEntries(): ToastEntry[] {
	return entries
}

export function subscribeEntries(cb: () => void): () => void {
	listeners.add(cb)
	return () => {
		listeners.delete(cb)
	}
}

export function setEntries(next: ToastEntry[]): void {
	if (next === entries) return
	entries = next
	notifyEntries()
}

export function notifyEntries(): void {
	for (const cb of [...listeners]) {
		try {
			cb()
		} catch (error) {
			reportError(error)
		}
	}
}
