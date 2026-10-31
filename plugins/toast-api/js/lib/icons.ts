import { lookupGeneratedIconComponent } from '@valenced/utils/discord'
import type { ToastVariant } from '../types'

export const VARIANT_ICON: Record<ToastVariant, string[] | undefined> = {
	default: undefined,
	success: [
		'CircleCheckIcon',
		'CircleCheckIcon-secondary',
		'CircleCheckIcon-primary',
	],
	critical: [
		'CircleErrorIcon',
		'CircleErrorIcon-secondary',
		'CircleErrorIcon-primary',
	],
	info: [
		'CircleInformationIcon',
		'CircleInformationIcon-secondary',
		'CircleInformationIcon-primary',
	],
	warning: ['WarningIcon'],
}

export function getIconComponent(...names: string[]) {
	const [name, ...assets] = names
	if (!name) return undefined
	return lookupGeneratedIconComponent(name, ...assets)
}
