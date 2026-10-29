import { setSettings } from './native'
import SettingsComponent from './settings'

export interface Settings {
	headings: boolean
	dimMarkers: boolean
	monoCode: boolean
	menu: string[]
}

// Ids match Format.kt
export const Formats = [
	{ id: 'bold', label: 'Bold', example: '**text**' },
	{ id: 'italic', label: 'Italic', example: '*text*' },
	{ id: 'underline', label: 'Underline', example: '__text__' },
	{ id: 'strike', label: 'Strikethrough', example: '~~text~~' },
	{ id: 'spoiler', label: 'Spoiler', example: '||text||' },
	{ id: 'code', label: 'Code', example: '`text`' },
	{ id: 'codeBlock', label: 'Code block', example: '```text```' },
	{ id: 'link', label: 'Link', example: '[text](address)' },
	{ id: 'h1', label: 'Big heading', example: '# text' },
	{ id: 'h2', label: 'Medium heading', example: '## text' },
	{ id: 'h3', label: 'Small heading', example: '### text' },
	{ id: 'subtext', label: 'Subtext', example: '-# text' },
	{ id: 'quote', label: 'Quote', example: '> text' },
	{ id: 'ansi', label: 'ANSI colour', example: 'Colours in an ```ansi block' },
]

export const DefaultSettings: Settings = {
	headings: true,
	dimMarkers: true,
	monoCode: true,
	menu: Formats.map(f => f.id),
}

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: { load: true, default: DefaultSettings },
	start({ jsonStorage, cleanup, plugin }) {
		// Tracked from subscribe: the settings page writes through another handle, which this cache doesn't see
		let current: Settings = { ...DefaultSettings, ...jsonStorage.cache }
		const push = (patch?: Partial<Settings>) => {
			if (patch) current = { ...current, ...patch }
			setSettings(current).catch(error => plugin.reportError(error))
		}

		push()
		cleanup(jsonStorage.subscribe(patch => push(patch as Partial<Settings>)))
	},
	SettingsComponent,
})
