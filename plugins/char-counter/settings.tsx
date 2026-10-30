import Page from '@valenced/components/Page'
import TableRowAssetIcon from '@valenced/components/TableRowAssetIcon'
import { Design } from '@valenced/discord/design'
import { ScrollView, View } from 'react-native'
import { CounterSquare, clamp, DefaultSettings, FontSize } from './shared'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps, ReactNode } from 'react'
import type { Settings } from './shared'

const {
	Slider,
	Stack,
	TableRadioGroup,
	TableRadioRow,
	TableRow,
	TableRowGroup,
	TableSwitchRow,
	Text,
} = Design

type SettingComponentProps = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: Settings }>
>

export default function SettingsComponent({
	api: { jsonStorage: storage },
}: SettingComponentProps) {
	const s = { ...DefaultSettings, ...storage.use() }
	const fontSize = clamp(s.fontSize, FontSize)

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
				<Stack spacing={24}>
					<TableRadioGroup
						key={`show-${s.show}`}
						title="Show"
						description="In a small square above the message box, while you type. Past the limit it turns red and says how far over you are."
						hasIcons
						defaultValue={s.show}
						onChange={(show: Settings['show']) => storage.set({ show })}
					>
						<TableRadioRow
							label="Characters typed"
							subLabel="45 characters"
							icon={<TableRowAssetIcon name="TextIcon" />}
							value="count"
						/>
						<TableRadioRow
							label="Typed out of the limit"
							subLabel="45 / 4,000 characters"
							icon={<TableRowAssetIcon name="TextIcon" />}
							value="limit"
						/>
						<TableRadioRow
							label="Characters left"
							subLabel="3,955 characters left"
							icon={<TableRowAssetIcon name="TextIcon" />}
							value="left"
						/>
					</TableRadioGroup>

					<TableRadioGroup
						key={`side-${s.side}`}
						title="Side"
						hasIcons
						defaultValue={s.side}
						onChange={(side: Settings['side']) => storage.set({ side })}
					>
						<TableRadioRow
							label="Left"
							icon={<TableRowAssetIcon name="ArrowLargeLeftIcon" />}
							value="left"
						/>
						<TableRadioRow
							label="Right"
							icon={<TableRowAssetIcon name="ArrowLargeRightIcon" />}
							value="right"
						/>
					</TableRadioGroup>

					<TableRowGroup>
						<SliderRow label="Text size">
							<View
								style={{
									flexDirection: 'row',
									alignItems: 'center',
									justifyContent: 'space-between',
								}}
							>
								<Text color="text-muted" variant="text-sm/normal">
									{`${fontSize} pt${fontSize === FontSize.default ? ' (default)' : ''}`}
								</Text>
								<CounterSquare
									text="45 characters"
									color="text-muted"
									fontSize={fontSize}
								/>
							</View>
							<Slider
								step={1}
								value={fontSize}
								minimumValue={FontSize.min}
								maximumValue={FontSize.max}
								onValueChange={value =>
									storage.set({ fontSize: Math.round(value) })
								}
							/>
						</SliderRow>
					</TableRowGroup>

					<TableRowGroup hasIcons>
						<TableSwitchRow
							label="Only near the limit"
							subLabel="Appears once a message is 90% of the way there"
							icon={<TableRowAssetIcon name="EyeIcon" />}
							value={!!s.onlyNearLimit}
							onValueChange={onlyNearLimit => storage.set({ onlyNearLimit })}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}

function SliderRow({
	label,
	description,
	children,
}: {
	label: string
	description?: string
	children: ReactNode
}) {
	return (
		<TableRow
			label={label}
			subLabel={
				<View style={{ gap: 8, marginTop: 8 }}>
					{children}
					{description ? (
						<Text variant="text-sm/normal" color="text-muted">
							{description}
						</Text>
					) : null}
				</View>
			}
		/>
	)
}
