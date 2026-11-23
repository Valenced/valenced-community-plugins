import { callNativeMethod } from '@valenced/modules/native'
import type { Settings } from '.'

export function setSettings(settings: Settings) {
	return callNativeMethod('bleelblep.live-markdown.setSettings', [settings])
}

declare module '@valenced/modules/native' {
	interface NativeMethods {
		'bleelblep.live-markdown.setSettings': [[settings: Settings], null]
	}
}
