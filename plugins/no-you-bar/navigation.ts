import { found } from './state'
import type { NavState, RootRef, Tab } from './state'

// Back from any tab lands on Home, as it did with the old tabs, so a switch
// leaves at most one tab screen open over the home layout (root: main, tabs:
// guilds). The order matters with the fade: whatever is under the incoming
// screen shows through while it fades, so the visible change goes last and
// screens that are covered are cleaned up only after the fade ends.
// Otherwise Home flashes between two tabs.
//
// Plain action objects with a `target` key reach a nested stack without
// going through the screens in between.

const ROOT_SCREEN: Partial<Record<Tab, string>> = {
	profile: 'you',
	settings: 'settings',
}

// Longer than the native fade (about 350 ms on Android).
const CLEANUP_DELAY = 500

let cleanupTimer: ReturnType<typeof setTimeout> | undefined

function rootRef() {
	const ref = found.root?.()
	if (!ref || ref.isReady?.() === false) return
	return ref
}

function findTabs(state: NavState | undefined): NavState | undefined {
	const main = state?.routes.find(r => r.name === 'main')?.state
	return main?.routes.find(r => r.name === 'tabs')?.state
}

function currentTab(ref: RootRef): Tab {
	const state = ref.getRootState()
	const top = state.routes[state.index]?.name
	if (top === 'you') return 'profile'
	if (top === 'settings') return 'settings'
	const tabs = findTabs(state)
	if (tabs?.routes[tabs.index]?.name === 'notifications') return 'notifications'
	return 'home'
}

function popTabsToHome(ref: RootRef) {
	const tabs = findTabs(ref.getRootState())
	if (tabs && tabs.index > 0)
		ref.dispatch({ type: 'POP_TO_TOP', target: tabs.key })
}

function openNotificationsInTabs(ref: RootRef) {
	const tabs = findTabs(ref.getRootState())
	if (!tabs || tabs.routes[tabs.index]?.name === 'notifications') return
	if (tabs.index > 0) ref.dispatch({ type: 'POP_TO_TOP', target: tabs.key })
	ref.dispatch({
		type: 'NAVIGATE',
		payload: { name: 'notifications', params: { inNestedNavigator: true } },
		target: tabs.key,
	})
}

// After a root tab (You, Settings) has faded in: drop the other root screen
// and Notifications, both hidden under it now.
function scheduleCleanup(screen: string) {
	if (cleanupTimer) clearTimeout(cleanupTimer)
	cleanupTimer = setTimeout(() => {
		cleanupTimer = undefined
		const ref = rootRef()
		if (!ref) return
		const root = ref.getRootState()
		if (root.routes[root.index]?.name !== screen) return
		const routes = root.routes.filter(
			(_route, index) => index === 0 || index === root.index,
		)
		if (routes.length !== root.routes.length) {
			ref.dispatch({
				type: 'RESET',
				payload: { ...root, routes, index: routes.length - 1 },
				target: root.key,
			})
		}
		popTabsToHome(ref)
	}, CLEANUP_DELAY)
}

export function switchTab(target: Tab) {
	const ref = rootRef()
	if (!ref || currentTab(ref) === target) return
	if (cleanupTimer) {
		clearTimeout(cleanupTimer)
		cleanupTimer = undefined
	}
	const root = ref.getRootState()
	const onRootScreen = root.index > 0

	const screen = ROOT_SCREEN[target]
	if (screen) {
		// Fade the new screen in over whatever is showing, tidy up later.
		ref.navigate(screen)
		scheduleCleanup(screen)
		return
	}

	// Home or Notifications live in the tabs stack. Set it up while it is
	// still covered, then uncover it.
	if (target === 'notifications') openNotificationsInTabs(ref)
	else popTabsToHome(ref)
	if (onRootScreen) ref.dispatch({ type: 'POP_TO_TOP', target: root.key })
}
