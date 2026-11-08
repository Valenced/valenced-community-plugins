import { getAssetIdByName } from '@valenced/assets'
import { Design } from '@valenced/discord/design'
import { lookupGeneratedIconComponent } from '@valenced/utils/discord'
import {
	Children,
	cloneElement,
	isValidElement,
	useMemo,
	useState,
} from 'react'
import { View } from 'react-native'
import { DEFAULTS as defaults } from '../defaults'
import { SectionEditor } from './SectionEditor'
import {
	arrangeSections,
	defaultSurfacePreferences,
} from './surfacePreferences'
import { componentName } from './surfaces'
import type { PluginApi } from '@valenced/plugins/types'
import type {
	ComponentProps,
	ComponentType,
	ReactElement,
	ReactNode,
} from 'react'
import type { PressableProps } from 'react-native'
import type { DeclutterSettings as Settings } from '../types'
import type { SurfacePreferences } from './surfacePreferences'
import type { SurfaceDefinition, SurfaceRowProps } from './surfaces'

export type SheetElement = ReactElement<
	ComponentProps<typeof Design.ActionSheet>
>
type GroupElement = ReactElement<{ children?: ReactNode }>
type Api = PluginApi<{ jsonStorage: Settings }>

// The host supports icon-only; the published IconButton type omits this variant.
type NativeIconButtonProps = Omit<
	ComponentProps<typeof Design.IconButton>,
	'variant'
> & {
	variant: ComponentProps<typeof Design.IconButton>['variant'] | 'icon-only'
}
function IconButton(props: NativeIconButtonProps) {
	const Button = Design.IconButton as ComponentType<NativeIconButtonProps>
	return <Button {...props} />
}

interface Entry {
	row: ReactNode
	key: string
	id?: string
}
export interface Group {
	key: string
	element: GroupElement
	entries: Entry[]
	passthrough?: ReactNode
}

type RowElement = ReactElement<SurfaceRowProps>
function isRow(node: ReactNode): node is RowElement {
	return (
		isValidElement<SurfaceRowProps>(node) &&
		(node.type === Design.ActionSheetRow ||
			(node.props.label != null && isValidElement(node.props.icon)))
	)
}

function isGroup(node: ReactNode): node is GroupElement {
	return (
		isValidElement<{ children?: ReactNode }>(node) &&
		componentName(node.type) === 'ActionSheetRowGroup'
	)
}

function labelText(label: ReactNode): string | undefined {
	if (typeof label === 'string' || typeof label === 'number')
		return String(label).trim() || undefined
	if (isValidElement<{ children?: ReactNode }>(label))
		return labelText(label.props.children)
}

// Prefer icons and keys because labels change with locale.
function fallbackIds(row: RowElement): string[] {
	const ids: string[] = []
	const icon = row.props.icon
	if (isValidElement<{ IconComponent?: unknown }>(icon)) {
		const name = componentName(icon.props.IconComponent)
		if (name) ids.push(`icon:${name}`)
	}
	const key = row.key?.match(/\$([^$]+)$/)?.[1]
	if (key) ids.push(`key:${key}`)
	const label = labelText(row.props.label)
	if (label) ids.push(`label:${label}`)
	return ids
}

function readGroups(sheet: SheetElement, surface: SurfaceDefinition): Group[] {
	const children = Children.toArray(sheet.props.children)
	const template = children.find(isGroup)
	const candidates = new Map<Entry, string[]>()
	const groups = children.flatMap((element, position): Group[] => {
		let group: GroupElement
		if (isGroup(element)) group = element
		else if (isRow(element) && template)
			group = cloneElement(template, {
				key: `adopted:${element.key ?? position}`,
				children: element,
			})
		else
			return [
				{
					key: `passthrough:${isValidElement(element) ? element.key : position}`,
					element: <></>,
					entries: [],
					passthrough: element,
				},
			]
		let primary: string | undefined
		const entries = Children.toArray(group.props.children).map((row, index) => {
			const entry: Entry = {
				row,
				key: isValidElement(row) && row.key !== null ? row.key : String(index),
			}
			if (isRow(row)) {
				const id = surface.identify(row)
				primary ??= id
				candidates.set(entry, [...(id ? [id] : []), ...fallbackIds(row)])
			}
			return entry
		})
		return [
			{
				// Keep section IDs stable when plugin rows change.
				key: `actions:${primary ?? group.key}`,
				element: group,
				entries,
			},
		]
	})
	const counts = new Map<string, number>()
	for (const ids of candidates.values())
		for (const id of new Set(ids)) counts.set(id, (counts.get(id) ?? 0) + 1)
	for (const { entries } of groups)
		for (const entry of entries) {
			entry.id = candidates.get(entry)?.find(id => counts.get(id) === 1)
			entry.key = entry.id ?? entry.key
		}
	return groups
}

function VisibilityButton({
	hidden,
	label,
	onPress,
}: {
	hidden: boolean
	label: string
	onPress(): void
}) {
	return (
		<IconButton
			icon={getAssetIdByName(hidden ? 'EyeSlashIcon' : 'EyeIcon')!}
			variant="icon-only"
			size="sm"
			hitSlop={6}
			accessibilityLabel={`${hidden ? 'Show' : 'Hide'} ${label}`}
			onPress={onPress}
		/>
	)
}

export function useSurfaceEditor(api: Api, surfaceId: string) {
	const stored = api.jsonStorage.use()
	const preferences = stored?.surfaces?.[surfaceId] ?? defaultSurfacePreferences
	const [editing, setEditing] = useState(false)
	const [undo, setUndo] = useState<SurfacePreferences>()
	function save(next: SurfacePreferences) {
		if (next === preferences || !api.jsonStorage.loaded) return
		setUndo({
			...preferences,
			hidden: [...preferences.hidden],
			order: [...preferences.order],
			sections: { ...preferences.sections },
		})
		api.jsonStorage
			.set(
				{
					...defaults,
					...api.jsonStorage.cache,
					surfaces: { ...api.jsonStorage.cache?.surfaces, [surfaceId]: next },
				},
				true,
			)
			.catch(error => api.plugin.reportError(error))
	}
	return { preferences, editing, setEditing, undo, setUndo, save }
}

export function EditorToolbar({
	api,
	surfaceId,
	editor,
}: {
	api: Api
	surfaceId: string
	editor: ReturnType<typeof useSurfaceEditor>
}) {
	const { preferences, editing, setEditing, undo, setUndo, save } = editor
	return (
		<Design.Stack
			direction="horizontal"
			spacing={8}
			align="center"
			justify="flex-end"
			style={{
				flexShrink: 0,
				flexWrap: 'wrap',
				paddingVertical: editing ? 8 : 0,
			}}
		>
			{editing ? (
				<>
					<Design.Button
						text="Undo"
						size="md"
						variant="secondary"
						disabled={!undo}
						onPress={() => {
							if (undo) {
								save(undo)
								setUndo(undefined)
							}
						}}
					/>
					<Design.Button
						text="Reset"
						size="md"
						variant="secondary"
						disabled={
							!preferences.hidden.length &&
							!preferences.order.length &&
							!Object.keys(preferences.sections ?? {}).length
						}
						onPress={() => save(defaultSurfacePreferences)}
					/>
					<Design.Button
						text="Done"
						size="md"
						onPress={() => setEditing(false)}
					/>
				</>
			) : (
				<IconButton
					icon={getAssetIdByName('SettingsIcon')!}
					variant="icon-only"
					size="sm"
					accessibilityLabel={`Customise ${surfaceId} actions`}
					disabled={!api.jsonStorage.loaded}
					onPress={() => setEditing(true)}
				/>
			)}
		</Design.Stack>
	)
}

type ReactionHeaderElement = ReactElement<
	Record<string, unknown>,
	(props: Record<string, unknown>) => ReactNode
>

function ReactionSettingsButton({
	picker,
	disabled,
	onPress,
}: {
	picker: ReactionHeaderElement
	disabled: boolean
	onPress(): void
}) {
	const SettingsIcon = useMemo(
		() => lookupGeneratedIconComponent('SettingsIcon'),
		[],
	)
	const button = picker.type({ ...picker.props, onPress })
	if (
		!isValidElement<PressableProps>(button) ||
		!isValidElement<ComponentProps<NonNullable<typeof SettingsIcon>>>(
			button.props.children,
		) ||
		!SettingsIcon
	)
		throw new Error('Reaction button changed; customisation was skipped')
	return cloneElement(button, {
		disabled,
		onPress,
		accessibilityLabel: 'Customise message actions',
		children: <SettingsIcon {...button.props.children.props} />,
	})
}

function ReactionHeader({
	header,
	disabled,
	onPress,
}: {
	header: ReactionHeaderElement
	disabled: boolean
	onPress(): void
}) {
	const tree = header.type(header.props)
	if (!isValidElement<{ children?: ReactNode }>(tree))
		throw new Error('Reaction header changed; customisation was skipped')
	const children = Children.toArray(tree.props.children)
	const row = children[0]
	if (!isValidElement<{ children?: ReactNode }>(row))
		throw new Error('Reaction row changed; customisation was skipped')
	const buttons = Children.toArray(row.props.children)
	const reactionIndex = buttons.findLastIndex(
		button =>
			isValidElement(button) &&
			componentName(button.type) === 'EmojiReactionRowButton',
	)
	const reaction = buttons[reactionIndex]
	const picker = buttons.at(-1)
	if (
		!isValidElement(reaction) ||
		!isValidElement(picker) ||
		componentName(picker.type) !== 'EmojiPickerRowButton' ||
		typeof picker.type !== 'function'
	)
		throw new Error('Reaction buttons changed; customisation was skipped')
	buttons.splice(reactionIndex, 1)
	buttons.push(
		<ReactionSettingsButton
			key="declutter-toolbar"
			picker={picker as ReactionHeaderElement}
			disabled={disabled}
			onPress={onPress}
		/>,
	)
	children[0] = cloneElement(row, { children: buttons })
	return cloneElement(tree, { children })
}

function EditableSheet({
	sheet,
	surface,
	api,
}: {
	sheet: SheetElement
	surface: SurfaceDefinition
	api: Api
}) {
	const editor = useSurfaceEditor(api, surface.id)
	const { preferences, editing, save } = editor
	const groups = useMemo(() => readGroups(sheet, surface), [sheet, surface])
	const headerId = surface.identifyHeader(sheet.props.header)
	const headerHidden = !!headerId && preferences.hidden.includes(headerId)
	const inlineToolbar =
		!editing &&
		!headerHidden &&
		headerId === 'reactions' &&
		isValidElement(sheet.props.header) &&
		typeof sheet.props.header.type === 'function'
	const toolbar = (
		<EditorToolbar
			key="declutter-toolbar"
			api={api}
			surfaceId={surface.id}
			editor={editor}
		/>
	)
	const header = (
		<View style={{ flexShrink: 0 }}>
			<EditorToolbar api={api} surfaceId={surface.id} editor={editor} />
			{editing && headerId ? (
				<View style={{ flexDirection: 'row', alignItems: 'center' }}>
					<Design.Text variant="text-sm/medium" style={{ flex: 1 }}>
						Reactions
					</Design.Text>
					<VisibilityButton
						hidden={headerHidden}
						label="reactions"
						onPress={() =>
							save({
								...preferences,
								hidden: headerHidden
									? preferences.hidden.filter(id => id !== headerId)
									: [...preferences.hidden, headerId],
							})
						}
					/>
				</View>
			) : null}
		</View>
	)
	const arranged = arrangeSections(
		groups,
		preferences,
		(entry: Entry) => entry.id,
	)
	return cloneElement(sheet, {
		// Preserve the native header's measurement and sheet-specific props.
		header: headerHidden ? undefined : inlineToolbar ? (
			<ReactionHeader
				header={sheet.props.header as ReactionHeaderElement}
				disabled={!api.jsonStorage.loaded}
				onPress={() => editor.setEditing(true)}
			/>
		) : (
			sheet.props.header
		),
		...(editing && {
			scrollable: false,
		}),
		children: editing ? (
			<SectionEditor
				inSheet
				header={header}
				groups={groups.filter(group => !group.passthrough)}
				preferences={preferences}
				onChange={save}
			/>
		) : (
			[
				inlineToolbar ? null : toolbar,
				...arranged.flatMap(group => {
					if (group.passthrough) return [group.passthrough]
					const children = group.entries
						.filter(
							entry => !entry.id || !preferences.hidden.includes(entry.id),
						)
						.map(entry =>
							isValidElement(entry.row)
								? cloneElement(entry.row, { key: entry.key })
								: entry.row,
						)
					return children.length
						? [cloneElement(group.element, { key: group.key, children })]
						: []
				}),
			]
		),
	})
}

export default function SheetEditor(
	props: ComponentProps<typeof EditableSheet>,
) {
	const enabled =
		props.api.jsonStorage.use()?.customizeMessageActions ??
		defaults.customizeMessageActions
	return enabled ? <EditableSheet {...props} /> : props.sheet
}
