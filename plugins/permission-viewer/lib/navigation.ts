import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { ImportTrackerModuleId } from '@valenced/discord/common/import-tracker'
import { LoggerModuleId } from '@valenced/discord/common/logger'
import { withStoreName } from '@valenced/discord/flux'
import { RootNavigationRef } from '@valenced/discord/modules/main_tabs_v2'
import { lookupModule } from '@valenced/modules/finders'
import {
	withDependencies,
	withName,
} from '@valenced/modules/finders/filters'
import { api } from '..'
import type { ComponentProps, ComponentType } from 'react'

/** Stashes a pushed screen's subject; navigator params drop on mounted routes. */

export interface Subject {
	guildId?: string
}

let current: Subject = {}

export function handOff(subject: Subject) {
	current = { ...current, ...subject }
}

export function readHandoff(): Subject {
	return { ...current }
}

export type SheetStacking = 'replaceAll' | 'replaceTopSheet' | 'stack'

/** Sheet module is already loaded, so the promise never suspends. */
export function openSheet<T extends ComponentType<any>>(
	key: string,
	sheet: T,
	props: ComponentProps<T>,
	stackingBehavior: SheetStacking,
) {
	ActionSheetActionCreators.openLazy(
		Promise.resolve({ default: sheet }),
		key,
		props,
		stackingBehavior,
	)
}

type ShowUserProfileActionSheet = (
	props: { userId: string },
	stackingBehavior?: SheetStacking,
) => void

const { ordered, relative } = withDependencies

export function openUserProfile(userId: string): void {
	const [show] = lookupModule(
		withName<ShowUserProfileActionSheet>('showUserProfileActionSheet').and(
			withDependencies(
				ordered([
					LoggerModuleId,
					lookupModule(withStoreName('UserStore'))[1],
					relative(1),
					relative(2),
					relative(3),
					ImportTrackerModuleId,
				]),
			),
		),
	)

	if (show) show({ userId }, 'stack')
	else api?.plugin.reportError('Could not open user profile')
}

/** Keys carry the subject id; a shared key collapses sheets into each other. */
const prefix = 'permission-viewer'

export function roleKey(guildId: string, roleId: string) {
	return `${prefix}-role-${guildId}-${roleId}`
}

export function roleMembersKey(guildId: string, roleId: string) {
	return `${prefix}-role-members-${guildId}-${roleId}`
}

export function userKey(guildId: string, userId: string) {
	return `${prefix}-user-${guildId}-${userId}`
}

export function channelKey(channelId: string) {
	return `${prefix}-channel-${channelId}`
}

export function channelOverwriteKey(channelId: string, subjectId: string) {
	return `${prefix}-channel-overwrite-${channelId}-${subjectId}`
}

/** Pushes a settings screen from anywhere; reports when the navigator is not ready. */
export function openScreen(route: string, subject?: Subject): void {
	const ref = RootNavigationRef.getRootNavigationRef()
	if (!ref?.isReady()) {
		api?.plugin.reportError(
			`the navigator was not ready, ${route} could not open.`,
		)
		return
	}

	if (subject) handOff(subject)

	ref.navigate(
		'settings',
		subject ? { screen: route, params: subject } : { screen: route },
	)
}
