import { useEffect, useState } from 'react'
import { getEntries, subscribeEntries } from '../api/store'
import { getSettingsSnapshot, subscribeSettings } from '../lib/settings'
import type { ToastApiSettings, ToastEntry } from '../types'

export function useSettings(): ToastApiSettings {
	const [value, setValue] = useState(getSettingsSnapshot)
	useEffect(() => subscribeSettings(() => setValue(getSettingsSnapshot())), [])
	return value
}

export function useEntries(): ToastEntry[] {
	const [value, setValue] = useState(getEntries)
	useEffect(() => subscribeEntries(() => setValue(getEntries())), [])
	return value
}
