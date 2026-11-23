import type { ToastApiSettings } from './types'

export const DEFAULTS: ToastApiSettings = {
	position: 'top',
	maxVisible: 3,

	durationMode: 'toast',
	defaultDurationMs: 2000,
	overrideDurationMs: 3000,
	minDurationMs: 0,
	maxDurationMs: 0,

	radius: 8,
	paddingY: 8,
	paddingX: 12,
	gap: 8,
	borderWidth: 1,
	shadow: true,
	maxWidth: 0,
	iconSize: 24,
	iconSide: 'left',
	showSecondIcon: false,
	lineClamp: 3,

	textVariant: 'text-sm/semibold',
	textSize: 0,
	textColor: '',
	fontFamily: '',
	backgroundColor: '',
	borderColor: '',

	showSubtitle: true,
	subtitleVariant: 'text-sm/normal',

	overrideDiscordToasts: false,
}
