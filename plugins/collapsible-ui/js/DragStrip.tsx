import { Tokens } from '@valenced/discord/common/tokens'
import { Design } from '@valenced/discord/design'
import { View } from 'react-native'
import type { GestureLibrary } from './PullHandle'

export const DRAG_STRIP_HEIGHT = 16

// Plugin modules are evaluated before Discord's design API is available.
let useStyles: ReturnType<typeof Design.createStyles> | undefined

// A 4dp visible grip inside a compact touch target, shared by every surface.
export function DragStrip({
	library,
	gesture,
	hidden,
	label,
	onToggle,
}: {
	library: GestureLibrary
	gesture: unknown
	hidden: boolean
	label: string
	onToggle(): void
}) {
	useStyles ??= Design.createStyles({
		strip: { backgroundColor: Tokens.default.colors.TEXT_MUTED },
	})
	const styles = useStyles()
	return (
		<library.GestureDetector gesture={gesture}>
			<View
				collapsable={false}
				accessible
				accessibilityRole="button"
				accessibilityLabel={`${hidden ? 'Expand' : 'Collapse'} ${label}`}
				accessibilityState={{ expanded: !hidden }}
				accessibilityHint="Drag vertically or double tap to toggle"
				accessibilityActions={[{ name: 'activate' }]}
				onAccessibilityTap={onToggle}
				onAccessibilityAction={onToggle}
				hitSlop={{ left: 8, right: 8 }}
				style={{
					height: DRAG_STRIP_HEIGHT,
					width: 72,
					alignSelf: 'center',
					alignItems: 'center',
					justifyContent: 'center',
				}}
			>
				<View
					style={[styles.strip, { width: 32, height: 4, borderRadius: 2 }]}
				/>
			</View>
		</library.GestureDetector>
	)
}
