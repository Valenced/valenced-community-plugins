import Page from '@valenced/components/Page'
import { AlertActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import {
	onSettingsModulesLoaded,
	refreshSettings,
	registerSettingsItems,
} from '@valenced/discord/modules/settings'
import { ReactNativeSafeAreaContext } from '@valenced/externals/react-native-safe-area-context'
import { ReactNavigationNative } from '@valenced/externals/react-navigation'
import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import {
	DefaultSettings,
	overrideFor,
	resetOverride,
	setOverride,
	useStorage,
} from './shared'
import { TAGS } from './tags'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps, ReactNode } from 'react'
import type { Settings } from './shared'

const {
	AlertActionButton,
	AlertModal,
	Card,
	Stack,
	TableRow,
	TableRowGroup,
	TableSwitchRow,
	Text,
	TextInput,
} = Design

const TagRoute = 'bleelblep.staff-tags.tag'

// Routes take no params, so the list sets this before navigating
let selectedId = ''

export function registerPages() {
	let unregister: (() => void) | undefined
	const unsubscribe = onSettingsModulesLoaded(() => {
		unregister = registerSettingsItems({
			[TagRoute]: {
				parent: null,
				type: 'route',
				useTitle: () => 'Tag',
				screen: { route: TagRoute, getComponent: () => TagEditor },
			},
		})
		refreshSettings()
	})

	return () => {
		unsubscribe()
		unregister?.()
		refreshSettings()
	}
}

type SettingsComponentProps = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: Settings }>
>

export default function SettingsComponent({
	api: { jsonStorage: storage },
}: SettingsComponentProps) {
	const { useRoleColor } = { ...DefaultSettings, ...storage.use() }
	const navigation = ReactNavigationNative.useNavigation() as {
		navigate(route: string): void
	}

	return (
		<ScrollPage>
			<TableRowGroup title="Tags — tap one to change it" hasIcons>
				{TAGS.map(tag => (
					<TableRow
						key={tag.id}
						label={tag.text}
						subLabel={describe(tag.id, tag.text)}
						icon={
							<Swatch
								color={colorOf(tag.id, tag.defaultColor)}
								dim={overrideFor(tag.id).enabled === false}
							/>
						}
						arrow
						onPress={() => {
							selectedId = tag.id
							navigation.navigate(TagRoute)
						}}
					/>
				))}
			</TableRowGroup>

			<TableRowGroup title="Everywhere">
				<TableSwitchRow
					label="Use top role colour for tag backgrounds"
					subLabel="A colour you set for a tag still wins over the role colour"
					value={!!useRoleColor}
					onValueChange={useRoleColor => storage.set({ useRoleColor })}
				/>
			</TableRowGroup>
		</ScrollPage>
	)
}

function TagEditor() {
	useStorage()

	const def = TAGS.find(tag => tag.id === selectedId)
	if (!def)
		return (
			<Page>
				<Text color="text-muted" variant="text-sm/normal">
					That tag no longer exists.
				</Text>
			</Page>
		)

	const custom = overrideFor(def.id)
	const enabled = custom.enabled !== false

	const confirmReset = () => {
		const key = 'StaffTagsReset'
		AlertActionCreators.openAlert(
			key,
			<AlertModal
				title={`Reset ${def.text}?`}
				content="Its text and colour go back to how they ship."
				actions={
					<>
						<AlertActionButton
							text="Reset"
							variant="destructive"
							onPress={() => {
								AlertActionCreators.dismissAlert(key)
								resetOverride(def.id)
							}}
						/>
						<AlertActionButton
							text="Cancel"
							variant="secondary"
							onPress={() => AlertActionCreators.dismissAlert(key)}
						/>
					</>
				}
			/>,
		)
	}

	return (
		<ScrollPage keyboardShouldPersistTaps="handled">
			<Card variant="secondary" border="none">
				<View style={{ padding: 16, alignItems: 'center' }}>
					<View
						style={{
							paddingHorizontal: 6,
							paddingVertical: 3,
							borderRadius: 4,
							backgroundColor: colorOf(def.id, def.defaultColor),
						}}
					>
						<Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>
							{custom.text?.trim() || def.text}
						</Text>
					</View>
				</View>
			</Card>

			<TableRowGroup>
				<TableSwitchRow
					label="Show this tag"
					subLabel={enabled ? 'Shown wherever it applies' : 'Hidden everywhere'}
					value={enabled}
					onValueChange={enabled => setOverride(def.id, { enabled })}
				/>
			</TableRowGroup>

			<TableRowGroup>
				<FieldRow
					label="Text"
					description="What the tag reads. Leave it empty for the original."
				>
					<TextInput
						placeholder={def.text}
						value={custom.text ?? ''}
						returnKeyType="done"
						isClearable
						onChange={text => setOverride(def.id, { text })}
					/>
				</FieldRow>
			</TableRowGroup>

			<TableRowGroup title="Colour">
				<TableSwitchRow
					label="Use my own colour"
					subLabel={`Off uses the tag's own ${def.defaultColor}`}
					value={!!custom.useCustomColor}
					onValueChange={useCustomColor =>
						setOverride(def.id, { useCustomColor })
					}
				/>
				{custom.useCustomColor ? (
					<ColorInput
						value={custom.color ?? ''}
						placeholder={def.defaultColor}
						onChange={color => setOverride(def.id, { color })}
					/>
				) : null}
			</TableRowGroup>

			<TableRowGroup>
				<TableRow
					label="Reset this tag"
					subLabel="Back to its original text and colour"
					variant="danger"
					onPress={confirmReset}
				/>
			</TableRowGroup>
		</ScrollPage>
	)
}

function ScrollPage({
	children,
	keyboardShouldPersistTaps,
}: {
	children: ReactNode
	keyboardShouldPersistTaps?: 'handled'
}) {
	const { bottom } = ReactNativeSafeAreaContext.useSafeAreaInsets()
	return (
		<Page>
			<ScrollView
				keyboardShouldPersistTaps={keyboardShouldPersistTaps}
				contentContainerStyle={{ paddingBottom: bottom + 16 }}
			>
				<Stack spacing={24}>{children}</Stack>
			</ScrollView>
		</Page>
	)
}

function colorOf(id: string, defaultColor: string) {
	const custom = overrideFor(id)
	return (custom.useCustomColor && custom.color) || defaultColor
}

function Swatch({ color, dim }: { color: string; dim?: boolean }) {
	return (
		<View
			style={{
				width: 28,
				height: 28,
				borderRadius: 6,
				backgroundColor: color,
				opacity: dim ? 0.4 : 1,
			}}
		/>
	)
}

function describe(id: string, original: string) {
	const custom = overrideFor(id)
	if (custom.enabled === false) return 'Hidden'
	const text = custom.text?.trim()
	const bits: string[] = []
	if (text && text !== original) bits.push(`reads “${text}”`)
	if (custom.useCustomColor && custom.color) bits.push(custom.color)
	return bits.length ? bits.join(', ') : 'As it ships'
}

function FieldRow({
	label,
	description,
	children,
}: {
	label: string
	description: string
	children: ReactNode
}) {
	return (
		<TableRow
			label={label}
			subLabel={
				<View style={{ gap: 8, marginTop: 8 }}>
					{children}
					<Text variant="text-sm/normal" color="text-muted">
						{description}
					</Text>
				</View>
			}
		/>
	)
}

function ColorInput({
	value,
	placeholder,
	onChange,
}: {
	value: string
	placeholder: string
	onChange(color: string): void
}) {
	const [draft, setDraft] = useState(value)
	const parsed = parseColor(draft)

	return (
		<FieldRow
			label="Background"
			description="Hex like #F0B232, or RGB like 240, 178, 50"
		>
			<View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
				<View
					style={{
						width: 36,
						height: 36,
						borderRadius: 8,
						backgroundColor: parsed ?? (value || placeholder),
					}}
				/>
				<View style={{ flex: 1 }}>
					<TextInput
						placeholder={placeholder}
						value={draft}
						returnKeyType="done"
						isClearable
						status={draft && !parsed ? 'error' : 'default'}
						errorMessage={
							draft && !parsed ? "That isn't a colour I can read" : undefined
						}
						onChange={next => {
							setDraft(next)
							const color = parseColor(next)
							if (color) onChange(color)
							else if (!next.trim()) onChange('')
						}}
					/>
				</View>
			</View>
		</FieldRow>
	)
}

function parseColor(input: string) {
	const value = input.trim()
	const hex = value.replace(/^#/, '')
	if (/^[0-9a-f]{6}$/i.test(hex)) return `#${hex.toUpperCase()}`
	if (/^[0-9a-f]{3}$/i.test(hex))
		return `#${hex.replace(/./g, c => c + c).toUpperCase()}`

	const rgb = value.match(
		/^(?:rgba?)?\(?\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})/i,
	)
	const parts = rgb?.slice(1, 4).map(Number)
	if (parts?.every(n => n <= 255))
		return `#${parts
			.map(n => n.toString(16).padStart(2, '0'))
			.join('')
			.toUpperCase()}`
}
