/**
 * The plugin's changelog: a clock icon at the top right of the settings page, opening a page with
 * every version (newest first, the installed one marked). After an update, the first visit to the
 * settings page shows a "What's new" dialog with what changed since the version last seen.
 * Nothing pops up at app start.
 *
 * The entries live in `js/changelog.ts`; `start()` calls `setupChangelog(api, CHANGELOG)` and the
 * settings page calls `useChangelog()` at its top.
 *
 * The last-seen version is kept in the plugin's own `jsonStorage` under `changelogSeenVersion`.
 * With nothing stored yet the plugin is treated as freshly installed: the version is recorded and
 * no dialog shows. The seen version only moves once the dialog has actually been shown.
 *
 * The same helper ships in each of bleelblep's plugins; this repository has no shared folder.
 */

import { getAssetIdByName } from '@valenced/assets'
import { Page } from '@valenced/components'
import { AlertActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import {
	onSettingsModulesLoaded,
	refreshSettings,
	registerSettingsItem,
} from '@valenced/discord/modules/settings'
import { ReactNavigationNative } from '@valenced/externals/react-navigation'
import { useEffect, useLayoutEffect } from 'react'
import { Dimensions, Pressable, ScrollView, View } from 'react-native'

export interface ChangelogEntry {
	/** Exactly as in manifest.json. */
	version: string
	/** `YYYY-MM-DD`. */
	date?: string
	/** A few words: what this version is about. */
	title?: string
	/** One sentence each, written for users. */
	changes: string[]
}

/** The parts of the plugin api the changelog reads: the manifest and the plugin's storage. */
interface ChangelogApi {
	plugin: { manifest: { id: string; name?: string; version: unknown } }
	jsonStorage?: ChangelogStorage
}

interface ChangelogStorage {
	get(): Promise<object>
	set(value: Record<string, unknown>): Promise<void>
}

interface Registered {
	id: string
	name: string
	current: string
	entries: ChangelogEntry[]
	storage: ChangelogStorage | undefined
	/** Versions newer than the last-seen one, waiting for the settings page to open. */
	pending?: ChangelogEntry[]
}

interface Navigation {
	navigate(route: string): void
	setOptions?(options: Record<string, unknown>): void
}

/** This bundle's plugin. Plain data, so module scope is fine. */
let registered: Registered | undefined

const SEEN_KEY = 'changelogSeenVersion'
/** Versions in the dialog; the rest are a tap away on the Changelog page. */
const DIALOG_VERSIONS = 3
const BOTTOM_PADDING = 24

export const changelogRoute = (id: string) => `${id}.changelog`

// ---------------------------------------------------------------------------------------------
// Versions

/**
 * The manifest version as a string. At runtime `api.plugin.manifest.version` is already parsed
 * into `{ nums, label }` (`label` is only the pre-release part), not the manifest string.
 */
function versionString(version: unknown): string {
	if (typeof version === 'string') return version
	const parsed = version as { nums?: unknown; label?: unknown } | null
	if (parsed && Array.isArray(parsed.nums)) {
		return parsed.nums.join('.') + (parsed.label ? `-${parsed.label}` : '')
	}
	return String(version ?? '')
}

function parse(version: string): { nums: number[]; pre: string | undefined } {
	const [main = '', pre] = String(version).split('-', 2)
	return { nums: main.split('.').map(n => Number.parseInt(n, 10) || 0), pre }
}

/** Semver order, with `1.0.0-beta2` before `1.0.0` and `beta10` after `beta9`. */
export function compareVersions(a: string, b: string): number {
	const x = parse(a)
	const y = parse(b)
	for (let i = 0; i < Math.max(x.nums.length, y.nums.length); i++) {
		const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0)
		if (d) return d
	}
	if (x.pre === y.pre) return 0
	if (x.pre === undefined) return 1
	if (y.pre === undefined) return -1
	return x.pre.localeCompare(y.pre, undefined, { numeric: true })
}

// ---------------------------------------------------------------------------------------------
// Setup

/**
 * Registers the Changelog page and works out whether there is anything new to show. Returns a
 * cleanup; pass it to `api.cleanup`.
 */
export function setupChangelog(
	api: ChangelogApi,
	entries: ChangelogEntry[],
): () => void {
	const { manifest } = api.plugin
	const plugin: Registered = {
		id: manifest.id,
		name: manifest.name ?? manifest.id,
		current: versionString(manifest.version),
		entries: [...entries].sort((a, b) => compareVersions(b.version, a.version)),
		storage: api.jsonStorage,
	}
	registered = plugin

	const unregisterPage = registerPage(plugin)
	checkForUpdate(plugin).catch(() => {
		/* the dialog is a nicety; a failed read costs nothing else */
	})

	return () => {
		if (registered === plugin) registered = undefined
		unregisterPage()
	}
}

async function checkForUpdate(plugin: Registered) {
	if (!plugin.storage) return
	const data = (await plugin.storage.get()) as Record<string, unknown>
	// Through versionString: a test build once stored the parsed `{ nums, label }` object here.
	const seen = data[SEEN_KEY] ? versionString(data[SEEN_KEY]) : undefined
	if (seen === plugin.current) return
	// Nothing stored is a fresh install; a downgrade has nothing new. Either way, say nothing.
	if (!seen || compareVersions(plugin.current, seen) < 0) {
		await plugin.storage.set({ [SEEN_KEY]: plugin.current })
		return
	}
	const fresh = plugin.entries.filter(
		e =>
			compareVersions(e.version, seen) > 0 &&
			compareVersions(e.version, plugin.current) <= 0,
	)
	if (fresh.length) plugin.pending = fresh
	else await plugin.storage.set({ [SEEN_KEY]: plugin.current })
}

// ---------------------------------------------------------------------------------------------
// The root page hook and header button

/**
 * Call at the top of the plugin's settings page, like any hook. Puts the changelog icon at the
 * top right and, after an update, shows "What's new" once.
 */
export function useChangelog() {
	const navigation = ReactNavigationNative.useNavigation() as Navigation

	useLayoutEffect(() => {
		if (registered)
			navigation.setOptions?.({ headerRight: () => <ChangelogButton /> })
	}, [navigation])

	useEffect(() => {
		const plugin = registered
		if (!plugin?.pending?.length) return
		const entries = plugin.pending
		plugin.pending = undefined
		showWhatsNew(plugin, entries, () =>
			navigation.navigate(changelogRoute(plugin.id)),
		)
		plugin.storage?.set({ [SEEN_KEY]: plugin.current }).catch(() => {
			/* the dialog shows again next time; nothing else is lost */
		})
	}, [navigation])
}

/** The clock icon that opens the Changelog page. */
function ChangelogButton() {
	const navigation = ReactNavigationNative.useNavigation() as Navigation
	const plugin = registered
	if (!plugin) return null
	const { TableRow } = Design
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel="Changelog"
			hitSlop={12}
			onPress={() => navigation.navigate(changelogRoute(plugin.id))}
			style={({ pressed }) => ({
				paddingHorizontal: 12,
				opacity: pressed ? 0.5 : 1,
			})}
		>
			<TableRow.Icon source={getAssetIdByName('ClockIcon')} />
		</Pressable>
	)
}

// ---------------------------------------------------------------------------------------------
// The dialog

function Bullets({ changes }: { changes: string[] }) {
	const { Text } = Design
	return (
		<View style={{ gap: 4 }}>
			{changes.map(change => (
				<View key={change} style={{ flexDirection: 'row' }}>
					<Text
						variant="text-sm/normal"
						color="text-muted"
						style={{ width: 14 }}
					>
						•
					</Text>
					<Text variant="text-sm/normal" color="text-muted" style={{ flex: 1 }}>
						{change}
					</Text>
				</View>
			))}
		</View>
	)
}

function versionHeading(entry: ChangelogEntry): string {
	return entry.title ? `${entry.version} · ${entry.title}` : entry.version
}

function showWhatsNew(
	plugin: Registered,
	entries: ChangelogEntry[],
	openChangelog: () => void,
) {
	const { AlertModal, AlertActionButton, Text } = Design
	const key = `bleelblep-whats-new-${plugin.id}`
	const close = () => AlertActionCreators.dismissAlert(key)
	const shown = entries.slice(0, DIALOG_VERSIONS)
	const more = entries.length - shown.length

	const content = (
		<ScrollView
			style={{ maxHeight: Math.round(Dimensions.get('window').height * 0.5) }}
			// Inside the alert, the scroll view has to claim the drag or the dialog eats it.
			nestedScrollEnabled
		>
			<View style={{ gap: 12 }}>
				{shown.map(entry => (
					<View key={entry.version} style={{ gap: 4 }}>
						<Text variant="text-sm/semibold" color="text-default">
							{versionHeading(entry)}
						</Text>
						<Bullets changes={entry.changes} />
					</View>
				))}
				{more > 0 ? (
					<Text variant="text-sm/normal" color="text-muted">
						And {more} more version{more === 1 ? '' : 's'} in the full
						changelog.
					</Text>
				) : null}
			</View>
		</ScrollView>
	)

	AlertActionCreators.openAlert(
		key,
		<AlertModal
			title={`What's new in ${plugin.name} ${plugin.current}`}
			extraContent={content}
			actions={
				<>
					<AlertActionButton
						text="Full changelog"
						variant="primary"
						onPress={() => {
							close()
							openChangelog()
						}}
					/>
					<AlertActionButton text="Close" variant="secondary" onPress={close} />
				</>
			}
		/>,
	)
}

// ---------------------------------------------------------------------------------------------
// The page

function registerPage(plugin: Registered): () => void {
	const route = changelogRoute(plugin.id)
	let unregister: (() => void) | undefined
	// Inside `onSettingsModulesLoaded`: registering before Discord's settings modules exist leaves
	// the page missing until a restart.
	const unsubscribe = onSettingsModulesLoaded(() => {
		unregister = registerSettingsItem(route, {
			parent: null,
			type: 'route',
			useTitle: () => 'Changelog',
			screen: { route, getComponent: () => ChangelogPage },
		})
		refreshSettings()
	})
	return () => {
		unsubscribe()
		unregister?.()
		unregister = undefined
		refreshSettings()
	}
}

function ChangelogPage() {
	const { Stack, Text, TableRowGroup, TableRow } = Design
	const plugin = registered
	if (!plugin) return null

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: BOTTOM_PADDING }}>
				<Stack spacing={24}>
					<Text color="text-muted" variant="text-sm/normal">
						Every version of {plugin.name}, newest first. You have{' '}
						{plugin.current}.
					</Text>
					{plugin.entries.map(entry => {
						const tag = entry.version === plugin.current ? ' · installed' : ''
						return (
							<TableRowGroup
								key={entry.version}
								title={`${entry.version}${tag}${entry.date ? ` · ${entry.date}` : ''}`}
							>
								<TableRow
									label={entry.title ?? `Version ${entry.version}`}
									subLabel={
										<View style={{ marginTop: 6 }}>
											<Bullets changes={entry.changes} />
										</View>
									}
								/>
							</TableRowGroup>
						)
					})}
				</Stack>
			</ScrollView>
		</Page>
	)
}
