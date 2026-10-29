import { getErrorStack } from '@valenced/utils/error'
import type { JsonStorage } from '@valenced/json-storage'

export interface TagOverride {
	enabled?: boolean
	text?: string
	useCustomColor?: boolean
	color?: string
}

export interface Settings {
	useRoleColor: boolean
	tags: Record<string, TagOverride>
}

export const DefaultSettings: Settings = { useRoleColor: false, tags: {} }

let storage: JsonStorage<Settings> | undefined
let reporter: { reportError(error: unknown): void } | undefined
const reported = new Set<string>()

export function init(
	jsonStorage?: JsonStorage<Settings>,
	plugin?: { reportError(error: unknown): void },
) {
	storage = jsonStorage
	reporter = plugin
}

export function useStorage() {
	storage?.use()
}

export function settings(): Settings {
	return { ...DefaultSettings, ...storage?.cache }
}

export function overrideFor(id: string): TagOverride {
	return settings().tags?.[id] ?? {}
}

export function setOverride(id: string, patch: TagOverride) {
	storage?.set({ tags: { [id]: patch } } as Partial<Settings>)
}

// set() merges and can't delete a key, so reset writes blank values instead
export function resetOverride(id: string) {
	setOverride(id, { enabled: true, text: '', useCustomColor: false, color: '' })
}

// Hooks run on every row, so each distinct error is reported once
export function report(context: string, error?: unknown) {
	const message =
		error === undefined ? context : `${context}: ${getErrorStack(error)}`
	if (reported.has(message)) return
	reported.add(message)
	reporter?.reportError(message)
}
