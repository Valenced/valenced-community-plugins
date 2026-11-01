import React, { useState, useEffect } from 'react'
import {
	DEFAULT_STORAGE,
	formatOrdinal,
	getActiveButtons,
	getButtonOrdinal,
	getNormalizedOrder,
	setButtonIndex,
} from '../lib/types'
import type { PluginApi } from '@valenced/plugins/types'
import type {
	YouBarButtonId,
	YouBarPlusStorage,
} from '../lib/types'

function formatButtonName(id: YouBarButtonId): string {
	switch (id) {
		case 'dms':
			return 'Direct Messages'
		case 'notifications':
			return 'Notifications'
		case 'settings':
			return 'Settings'
		case 'favorites':
			return 'Favorites'
	}
}

function openPositionPicker({
	buttonName,
	buttonId,
	storage,
	onSelect,
}: {
	buttonName: string
	buttonId: YouBarButtonId
	storage: Partial<YouBarPlusStorage>
	onSelect: (targetIndex: number) => void
}) {
	const actions = valenced.discord.actions.ActionSheetActionCreators
	const active = getActiveButtons(storage)
	const currentIdx = active.indexOf(buttonId)

	actions?.openLazy?.(
		Promise.resolve({
			default: () => {
				const {
					ActionSheet,
					BottomSheetTitleHeader,
					ActionSheetCloseButton,
					TableRowGroup,
					TableRow,
					Stack,
				} = valenced.discord.design.Design as any
				const { TableRowAssetIcon } = (valenced.components ?? {}) as any

				const options = active.map((occupantId, index) => {
					const ordinal = formatOrdinal(index + 1)
					const occupantName = formatButtonName(occupantId)
					const isCurrent = index === currentIdx
					const desc = isCurrent
						? `Current position (${index + 1} of ${active.length})`
						: `Swap with ${occupantName} (Position ${index + 1} of ${active.length})`

					return {
						index,
						label: `${ordinal} Position`,
						desc,
						isCurrent,
					}
				})

				return (
					<ActionSheet
						header={
							<BottomSheetTitleHeader
								title={`${buttonName} Position`}
								subtitle="Choose position (swaps with current occupant)"
								trailing={
									<ActionSheetCloseButton
										onPress={() => actions.hideActionSheet()}
									/>
								}
							/>
						}
					>
						<Stack spacing={8} style={{ padding: 16 }}>
							<TableRowGroup>
								{options.map(opt => (
									<TableRow
										key={opt.index}
										icon={
											opt.isCurrent && TableRowAssetIcon ? (
												<TableRowAssetIcon name="CheckmarkLargeIcon" />
											) : undefined
										}
										label={opt.label}
										subLabel={opt.desc}
										onPress={() => {
											onSelect(opt.index)
											actions.hideActionSheet()
										}}
									/>
								))}
							</TableRowGroup>
						</Stack>
					</ActionSheet>
				)
			},
		}),
		`youbar-position-picker:${buttonName}`,
		{},
	)
}

export default function Settings({
	api,
}: {
	api: PluginApi<{ jsonStorage: YouBarPlusStorage }>
}) {
	const { Page } =
		valenced.components as typeof import('@valenced/components')
	const { ScrollView, View } = valenced.react.ReactNative
	const { TableRowGroup, TableSwitchRow, TableRow, Stack, Card, Text } = valenced
		.discord.design.Design as any

	const [storage, setStorage] = useState<YouBarPlusStorage>(() => ({
		...DEFAULT_STORAGE,
		...((api.jsonStorage.cache as Partial<YouBarPlusStorage> | undefined) ?? {}),
	}))

	useEffect(() => {
		const unsub = api.jsonStorage.subscribe((data: any) => {
			if (data) {
				setStorage(prev => ({ ...prev, ...data }))
			}
		})
		return () => {
			unsub?.()
		}
	}, [api.jsonStorage])

	const activeButtons = getActiveButtons(storage)

	const handleSetPosition = (
		buttonId: YouBarButtonId,
		targetActiveIndex: number,
	) => {
		const newOrder = setButtonIndex(storage, buttonId, targetActiveIndex)
		api.jsonStorage.set({ order: newOrder })
	}

	const dmOrdinal = getButtonOrdinal(storage, 'dms')
	const notifOrdinal = getButtonOrdinal(storage, 'notifications')
	const settingsOrdinal = getButtonOrdinal(storage, 'settings')
	const favoritesOrdinal = getButtonOrdinal(storage, 'favorites')

	return (
		<Page>
			<View style={{ flex: 1 }}>
				<ScrollView contentContainerStyle={{ padding: 16 }}>
					<Stack spacing={16}>
						<Card>
							<View style={{ padding: 16 }}>
								<Text variant="heading-md/semibold">YouBar+</Text>
								<Text
									variant="text-sm/normal"
									color="text-muted"
									style={{ marginTop: 6 }}
								>
									Customize the YouBar bottom navigation cluster with Direct
									Messages, Notifications, and Settings shortcuts.
								</Text>
								<Text
									variant="text-xs/normal"
									color="text-muted"
									style={{ marginTop: 4 }}
								>
									Version 1.0.0-b • By Rosie
								</Text>
							</View>
						</Card>

						<TableRowGroup title="Buttons">
							<TableSwitchRow
								label="Direct Messages Button"
								subLabel="Toggle DM shortcut icon on the YouBar"
								value={storage?.showDMButton !== false}
								onValueChange={(v: boolean) =>
									api.jsonStorage.set({ showDMButton: v })
								}
							/>
							<TableSwitchRow
								label="Notifications Button"
								subLabel="Toggle Notifications shortcut icon on the YouBar"
								value={storage?.showNotificationsButton !== false}
								onValueChange={(v: boolean) =>
									api.jsonStorage.set({ showNotificationsButton: v })
								}
							/>
							<TableSwitchRow
								label="Settings Button"
								subLabel="Toggle Settings shortcut icon on the YouBar"
								value={storage?.showSettingsButton !== false}
								onValueChange={(v: boolean) =>
									api.jsonStorage.set({ showSettingsButton: v })
								}
							/>
							<TableSwitchRow
								label="Favorites Button"
								subLabel="Toggle Favorites shortcut icon on the YouBar"
								value={storage?.showFavoritesButton === true}
								onValueChange={(v: boolean) =>
									api.jsonStorage.set({ showFavoritesButton: v })
								}
							/>
							<TableSwitchRow
								label="Hide Native DMs Tab"
								subLabel="Hide the stock Discord Direct Messages tab from the server bar"
								value={!!storage?.hideBuiltinDM}
								onValueChange={(v: boolean) =>
									api.jsonStorage.set({ hideBuiltinDM: v })
								}
							/>
							<TableSwitchRow
								label="Double-Tap Return"
								subLabel="Double-tapping DM returns to previous server/channel"
								value={storage?.doubleTapReturn !== false}
								onValueChange={(v: boolean) =>
									api.jsonStorage.set({ doubleTapReturn: v })
								}
							/>
						</TableRowGroup>

						<TableRowGroup title="Favorites">
							<TableSwitchRow
								label="Unlimited Local Favorites"
								subLabel="Bypass the 3-channel limit for non-Nitro users by saving extra favorites locally"
								value={storage?.localFavorites !== false}
								onValueChange={(v: boolean) =>
									api.jsonStorage.set({ localFavorites: v })
								}
							/>
						</TableRowGroup>

						<TableRowGroup title="Button Arrangement">
							{storage?.showDMButton !== false && (
								<TableRow
									label="Direct Messages"
									subLabel={`Current position: ${dmOrdinal}`}
									trailing={
										<Text variant="text-sm/semibold" color="text-brand">
											{dmOrdinal}
										</Text>
									}
									onPress={() =>
										openPositionPicker({
											buttonName: 'Direct Messages',
											buttonId: 'dms',
											storage,
											onSelect: idx => handleSetPosition('dms', idx),
										})
									}
									arrow
								/>
							)}
							{storage?.showNotificationsButton !== false && (
								<TableRow
									label="Notifications"
									subLabel={`Current position: ${notifOrdinal}`}
									trailing={
										<Text variant="text-sm/semibold" color="text-brand">
											{notifOrdinal}
										</Text>
									}
									onPress={() =>
										openPositionPicker({
											buttonName: 'Notifications',
											buttonId: 'notifications',
											storage,
											onSelect: idx => handleSetPosition('notifications', idx),
										})
									}
									arrow
								/>
							)}
							{storage?.showSettingsButton !== false && (
								<TableRow
									label="Settings"
									subLabel={`Current position: ${settingsOrdinal}`}
									trailing={
										<Text variant="text-sm/semibold" color="text-brand">
											{settingsOrdinal}
										</Text>
									}
									onPress={() =>
										openPositionPicker({
											buttonName: 'Settings',
											buttonId: 'settings',
											storage,
											onSelect: idx => handleSetPosition('settings', idx),
										})
									}
									arrow
								/>
							)}
							{storage?.showFavoritesButton && (
								<TableRow
									label="Favorites"
									subLabel={`Current position: ${favoritesOrdinal}`}
									trailing={
										<Text variant="text-sm/semibold" color="text-brand">
											{favoritesOrdinal}
										</Text>
									}
									onPress={() =>
										openPositionPicker({
											buttonName: 'Favorites',
											buttonId: 'favorites',
											storage,
											onSelect: idx => handleSetPosition('favorites', idx),
										})
									}
									arrow
								/>
							)}
						</TableRowGroup>

						<TableRowGroup title="Compacting">
							<TableSwitchRow
								label="Hide Status"
								subLabel="Hide status underneath your name on the YouBar pill"
								value={!!storage?.hideStatus}
								onValueChange={(v: boolean) =>
									api.jsonStorage.set({ hideStatus: v })
								}
							/>
							<TableSwitchRow
								label="Shrink Profile Picture"
								subLabel="Reduce profile picture size on the YouBar pill"
								value={!!storage?.compactAvatar}
								onValueChange={(v: boolean) =>
									api.jsonStorage.set({ compactAvatar: v })
								}
							/>
							<TableSwitchRow
								label="Compact Header Padding"
								subLabel="Reduce vertical padding of the YouBar pill container"
								value={!!storage?.compactHeader}
								onValueChange={(v: boolean) =>
									api.jsonStorage.set({ compactHeader: v })
								}
							/>
						</TableRowGroup>
					</Stack>
				</ScrollView>
			</View>
		</Page>
	)
}
