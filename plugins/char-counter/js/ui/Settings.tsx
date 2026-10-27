import Page from '@valenced/components/Page'
import TableRowAssetIcon from '@valenced/components/TableRowAssetIcon'
import { Design } from '@valenced/discord/design'
import { ScrollView, View } from 'react-native'
import { DEFAULTS, FONT_SIZE, SPLIT_DELAY, SPLIT_MAX } from '../index'
import { CounterSquare, fontSizeOf } from '../lib/badge'
import { useChangelog } from '../lib/changelog'
import { delaySecondsOf, maxPartsOf } from '../lib/sender'
import { FieldRow } from './FieldRow'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { CharCounterStorage } from '../index'

type Props = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: CharCounterStorage }>
>

export default function Settings({ api }: Props) {
	// The changelog icon at the top right, and "What's new" once after an update.
	useChangelog()
	const {
		Stack,
		Text,
		TableRowGroup,
		TableSwitchRow,
		TableRadioGroup,
		TableRadioRow,
		Slider,
	} = Design

	const s = { ...DEFAULTS, ...(api.jsonStorage.use() ?? {}) }

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
				<Stack spacing={24}>
					<TableRadioGroup<CharCounterStorage['show']>
						key={`show-${s.show}`}
						title="Show"
						description="In a small square above the message box, while you type. Past the limit it turns red and says how far over you are."
						hasIcons
						defaultValue={s.show}
						onChange={show => api.jsonStorage.set({ show })}
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

					<TableRadioGroup<CharCounterStorage['side']>
						key={`side-${s.side}`}
						title="Side"
						hasIcons
						defaultValue={s.side}
						onChange={side => api.jsonStorage.set({ side })}
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
						<FieldRow label="Text size">
							<View
								style={{
									flexDirection: 'row',
									alignItems: 'center',
									justifyContent: 'space-between',
								}}
							>
								<Text color="text-muted" variant="text-sm/normal">
									{`${fontSizeOf(s)} pt${fontSizeOf(s) === FONT_SIZE.default ? ' (default)' : ''}`}
								</Text>
								<CounterSquare
									text="45 characters"
									colour="text-muted"
									fontSize={fontSizeOf(s)}
								/>
							</View>
							<Slider
								step={1}
								value={fontSizeOf(s)}
								minimumValue={FONT_SIZE.min}
								maximumValue={FONT_SIZE.max}
								onValueChange={value =>
									api.jsonStorage.set({ fontSize: Math.round(value) })
								}
							/>
						</FieldRow>
					</TableRowGroup>

					<TableRowGroup hasIcons>
						<TableSwitchRow
							label="Only near the limit"
							subLabel="Appears once a message is 90% of the way there"
							icon={<TableRowAssetIcon name="EyeIcon" />}
							value={!!s.onlyNearLimit}
							onValueChange={value =>
								api.jsonStorage.set({ onlyNearLimit: value })
							}
						/>
					</TableRowGroup>

					<TableRowGroup title="Long messages" hasIcons>
						<TableSwitchRow
							label="Split long messages"
							subLabel="Past the limit, the message goes out as several, cut at a blank line, a line break or the end of a sentence. Code blocks are closed and reopened."
							icon={<TableRowAssetIcon name="ChatIcon" />}
							value={!!s.split}
							onValueChange={split => api.jsonStorage.set({ split })}
						/>
						{s.split ? (
							<FieldRow
								label={`Wait between messages — ${delaySecondsOf(s)} s`}
								description="So the parts arrive in order and read as one. A channel's slowmode wins when it's longer."
							>
								<Slider
									step={SPLIT_DELAY.step}
									value={delaySecondsOf(s)}
									minimumValue={SPLIT_DELAY.min}
									maximumValue={SPLIT_DELAY.max}
									onValueChange={value =>
										api.jsonStorage.set({
											splitDelaySec:
												Math.round(value / SPLIT_DELAY.step) * SPLIT_DELAY.step,
										})
									}
								/>
							</FieldRow>
						) : null}
						{s.split ? (
							<FieldRow
								label={`At most — ${maxPartsOf(s)} messages`}
								description="Anything longer is sent as typed, and Discord says it's too long."
							>
								<Slider
									step={1}
									value={maxPartsOf(s)}
									minimumValue={SPLIT_MAX.min}
									maximumValue={SPLIT_MAX.max}
									onValueChange={value =>
										api.jsonStorage.set({ splitMax: Math.round(value) })
									}
								/>
							</FieldRow>
						) : null}
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
