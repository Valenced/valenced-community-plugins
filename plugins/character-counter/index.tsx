import { Design } from '@valenced/discord/design'
import { getModules } from '@valenced/modules/finders'
import {
	createFilterGenerator,
	withProps,
} from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { useImperativeHandle, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import SettingsComponent from './settings'
import { DefaultSettings } from './shared'
import type { JsonStorage } from '@valenced/json-storage'
import type {
	Filter,
	FilterGenerator,
	FilterScopes,
} from '@valenced/modules/finders/filters'
import type { FC, MemoExoticComponent, Ref } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import type { Settings } from './shared'

const { Text } = Design

let storage: JsonStorage<Settings>
let MessageMaxLength: { getMaxMessageLength(): number } | undefined

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: {
		load: true,
		default: DefaultSettings,
	},
	start({ cleanup, jsonStorage, plugin }) {
		if (plugin.startedLate) {
			plugin.requireReload()
			return
		}

		storage = jsonStorage

		cleanup(
			getModules(
				withProps<{ getMaxMessageLength(): number }>('getMaxMessageLength'),
				mod => {
					MessageMaxLength = mod
				},
			),
			getModules(
				withMemoizedNamedComponent<CounterProps>('ChatInputCharCounter'),
				ChatInputCharCounter => {
					cleanup(
						instead(ChatInputCharCounter, 'type', ([props]) => (
							<CharacterCounter {...props} />
						)),
					)
				},
			),
		)
	},
	stop({ plugin }) {
		plugin.requireReload()
	},
	SettingsComponent,
})

function CharacterCounter({ ref, style }: CounterProps) {
	const [length, setLength] = useState(0)
	const { colorEffects } = {
		...DefaultSettings,
		...storage.use(x => 'colorEffects' in x),
	}

	useImperativeHandle(ref, () => ({ onMessageLengthChanged: setLength }), [])

	if (!length) return null

	const max = MessageMaxLength?.getMaxMessageLength() ?? 2000

	return (
		<View style={style} pointerEvents="none">
			<View style={styles.container}>
				<Text
					variant="text-xxs/semibold"
					color={colorEffects ? getColor(length / max) : 'text-muted'}
				>
					{length}/{max}
				</Text>
			</View>
		</View>
	)
}

function getColor(ratio: number) {
	if (ratio < 0.5) return 'text-muted'
	if (ratio < 0.9) return 'text-feedback-warning'
	return 'text-feedback-critical'
}

const styles = StyleSheet.create({
	container: {
		paddingHorizontal: 4,
		transform: [{ translateX: 1 }, { translateY: -11 }],
	},
})

type WithMemoizedNamedComponent = FilterGenerator<
	<P = object>(
		name: string,
	) => Filter<{
		Result: MemoExoticComponent<FC<P>>
		Scopes: [typeof FilterScopes.Initialized]
	}>
>

const withMemoizedNamedComponent = createFilterGenerator(
	([name], _, exports) => exports?.type?.displayName === name,
	([name]) => `memoizedNamedComponent(${name})`,
) as WithMemoizedNamedComponent

interface CounterProps {
	ref: Ref<{ onMessageLengthChanged(length: number): void }>
	style: StyleProp<ViewStyle>
	analyticsLocations: unknown
}
