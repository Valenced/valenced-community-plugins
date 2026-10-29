import { Tokens } from '@valenced/discord/common/tokens'
import { Design } from '@valenced/discord/design'
import { proxify } from '@valenced/utils/proxy'
import { View } from 'react-native'

export interface Settings {
	show: 'count' | 'limit' | 'left'
	side: 'left' | 'right'
	onlyNearLimit: boolean
	fontSize: number
	split: boolean
	splitDelaySec: number
	splitMax: number
}

interface Range {
	min: number
	max: number
	step?: number
	default: number
}

export const FontSize = { min: 10, max: 20, default: 12 }
export const SplitDelay = { min: 0, max: 10, step: 0.5, default: 1 }
export const SplitMax = { min: 2, max: 10, default: 5 }

export const DefaultSettings: Settings = {
	show: 'count',
	side: 'left',
	onlyNearLimit: false,
	fontSize: FontSize.default,
	split: true,
	splitDelaySec: SplitDelay.default,
	splitMax: SplitMax.default,
}

export function clamp(value: unknown, range: Range): number {
	const n = Number(value)
	if (!Number.isFinite(n)) return range.default
	const step = range.step ?? 1
	return Math.min(range.max, Math.max(range.min, Math.round(n / step) * step))
}

const useStyles = proxify(() =>
	Design.createStyles({
		square: {
			minWidth: 32,
			paddingHorizontal: 8,
			paddingVertical: 4,
			borderRadius: 8,
			alignItems: 'center',
			justifyContent: 'center',
			backgroundColor:
				Tokens.default.colors.MOBILE_CHATINPUT_BACKGROUND_DEFAULT,
			elevation: 4,
		},
	}),
)

export function CounterSquare({
	text,
	color,
	fontSize,
}: {
	text: string
	color: string
	fontSize: number
}) {
	const styles = useStyles()
	const lineHeight = Math.round(fontSize * 1.34)

	return (
		<View style={[styles.square, { minHeight: lineHeight + 12 }]}>
			<Design.Text
				variant="text-xs/semibold"
				color={color}
				lineClamp={1}
				style={{ fontSize, lineHeight }}
			>
				{text}
			</Design.Text>
		</View>
	)
}
