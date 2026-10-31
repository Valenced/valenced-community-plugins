import { Design } from '@valenced/discord/design'
import {
	getModuleWithImportedPath,
	lookupModuleWithImportedPath,
} from '@valenced/discord/utils/modules/finders'
import { instead } from '@valenced/patcher'
import { useImperativeHandle, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import SettingsComponent from './settings'
import { DefaultSettings } from './shared'
import type { JsonStorage } from '@valenced/json-storage'
import type { FC, MemoExoticComponent, Ref } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import type { Settings } from './shared'

const { Text } = Design

let storage: JsonStorage<Settings>

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
			getModuleWithImportedPath<{
				default: MemoExoticComponent<FC<CounterProps>> & {
					type: FC<CounterProps>
				}
			}>(
				'modules/chat_input/native/accessories/ChatInputCharCounter.tsx',
				({ default: ChatInputCharCounter }) => {
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

	const max =
		lookupModuleWithImportedPath<{ getMaxMessageLength(): number }>(
			'modules/messages/useMessageMaxLength.tsx',
		)[0]?.getMaxMessageLength() ?? 2000

	return (
		<View style={[style, styles.container]} pointerEvents="none">
			<Text
				variant="text-xxs/semibold"
				color={colorEffects ? getColor(length / max) : 'text-muted'}
			>
				{length}/{max}
			</Text>
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
		marginRight: 48,
	},
})

interface CounterProps {
	ref: Ref<{ onMessageLengthChanged(length: number): void }>
	style: StyleProp<ViewStyle>
	analyticsLocations: unknown
}
