import { Design } from '@valenced/discord/design'
import {
	onSettingsModulesLoaded,
	refreshSettings,
} from '@valenced/discord/modules/settings'
import { SettingListRenderer } from '@valenced/discord/modules/settings/renderer'
import { getModules } from '@valenced/modules/finders'
import { withName } from '@valenced/modules/finders/filters'
import { after } from '@valenced/patcher'
import {
	cloneElement,
	createContext,
	isValidElement,
	useContext,
	useMemo,
} from 'react'
import { View } from 'react-native'
import { DEFAULTS as defaults } from '../defaults'
import { EditorRow, SectionEditor } from './SectionEditor'
import { EditorToolbar, useSurfaceEditor } from './SheetEditor'
import { applySettingsLayout, groupSettingsRows } from './settingsLayout'
import type { PluginApi } from '@valenced/plugins/types'
import type {
	ComponentProps,
	ComponentType,
	ReactElement,
	ReactNode,
} from 'react'
import type { DeclutterSettings as Settings } from '../types'
import type { SettingsLayoutHeader, SettingsLayoutRow } from './settingsLayout'

type Api = PluginApi<{ jsonStorage: Settings }>
interface SettingRow extends SettingsLayoutRow {
	settingData: {
		useTitle(): string
		useDescription?(): string
		IconComponent?: ComponentProps<typeof Design.TableRow.Icon>['IconComponent']
		variant?: ComponentProps<typeof Design.TableRow>['variant']
	}
}
interface SettingHeader extends SettingsLayoutHeader {
	label?: ReactNode
}
interface ListProps<T = SettingRow | SettingHeader> {
	data: T[]
	keyExtractor?(item: T, index: number): string
	getItemType?(item: T): string
	ListHeaderComponent?: ComponentType | ReactElement | null
	renderItem(info: { item: T; index: number; target: string }): ReactNode
}
type ListTree = ReactElement<ListProps>
type SettingsGroup = NonNullable<
	ReturnType<typeof groupSettingsRows<SettingRow, SettingHeader>>
>[number]

// These rows are only mounted in edit mode; normal navigation remains Discord's renderer.
function SettingPreview({
	item,
	label,
	trailing,
	start,
	end,
}: {
	item: SettingRow
	count: number
	label?: string
	trailing?: ReactNode
	start?: boolean
	end?: boolean
}) {
	const { useDescription, IconComponent, variant } = item.settingData
	return (
		<Design.TableRow
			label={label ?? item.setting}
			subLabel={useDescription?.()}
			icon={
				IconComponent && <Design.TableRow.Icon IconComponent={IconComponent} />
			}
			variant={variant}
			trailing={trailing}
			start={start}
			end={end}
		/>
	)
}

function SettingsEditableRow(props: ComponentProps<typeof EditorRow>) {
	const row = props.entry.row as ReactElement<
		ComponentProps<typeof SettingPreview>
	>
	const label = row.props.item.settingData.useTitle()
	return (
		<EditorRow
			{...props}
			entry={{
				...props.entry,
				row: cloneElement(row, {
					start: props.slot === 0,
					end: props.slot === props.count - 1,
					// EditableRow uses this label for its accessibility controls.
					label,
				}),
			}}
		/>
	)
}

function SettingsEditor({
	tree,
	api,
	groups,
}: {
	tree: ListTree
	api: Api
	groups: SettingsGroup[]
}) {
	const editor = useSurfaceEditor(api, 'settings')
	const { preferences, editing, save } = editor
	const Header = tree.props.ListHeaderComponent
	const header = (
		<View>
			<EditorToolbar api={api} surfaceId="settings" editor={editor} />
			<View
				pointerEvents={editing ? 'none' : 'auto'}
				accessibilityElementsHidden={editing}
			>
				{isValidElement(Header) ? Header : Header ? <Header /> : null}
			</View>
		</View>
	)
	const data = useMemo(
		() => applySettingsLayout(groups, preferences),
		[groups, preferences],
	)
	if (!editing) return cloneElement(tree, { data, ListHeaderComponent: header })
	return (
		<View style={{ flex: 1, paddingHorizontal: 16 }}>
			<SectionEditor
				header={header}
				groups={groups.map(group => ({
					key: group.key,
					title:
						typeof group.header?.label === 'string'
							? group.header.label
							: undefined,
					entries: group.rows.map(item => ({
						id: item.setting,
						key: item.setting,
						row: <SettingPreview item={item} count={group.rows.length} />,
					})),
				}))}
				preferences={preferences}
				onChange={save}
				RowComponent={SettingsEditableRow}
			/>
		</View>
	)
}

export function registerSettingsEditor(api: Api) {
	const Overview = createContext(false)
	let active = true
	function Scope({ tree }: { tree: ReactNode }) {
		const enabled =
			api.jsonStorage.use()?.customizeSettings ?? defaults.customizeSettings
		return (
			<Overview.Provider value={active && enabled}>{tree}</Overview.Provider>
		)
	}
	function List({ tree }: { tree: ListTree }) {
		const enabled = useContext(Overview)
		const groups = useMemo(
			() => groupSettingsRows<SettingRow, SettingHeader>(tree.props.data),
			[tree.props.data],
		)
		return enabled && groups ? (
			<SettingsEditor tree={tree} api={api} groups={groups} />
		) : (
			tree
		)
	}
	api.cleanup(
		onSettingsModulesLoaded(() => {
			api.cleanup(
				getModules(
					withName<(props: unknown) => ReactNode>('SettingsOverviewScreen'),
					owner => {
						if ('default' in owner) {
							api.cleanup(
								after(owner, 'default', tree => <Scope tree={tree} />),
							)
							refreshSettings()
						}
					},
					{ returnNamespace: true },
				),
			)
			api.cleanup(
				after(SettingListRenderer.SearchableSettingsList, 'type', tree => {
					if (
						!isValidElement<ListProps>(tree) ||
						!Array.isArray(tree.props.data)
					)
						return tree
					return <List tree={tree} />
				}),
			)
			refreshSettings()
		}),
	)
	api.cleanup(() => {
		active = false
		refreshSettings()
	})
}
