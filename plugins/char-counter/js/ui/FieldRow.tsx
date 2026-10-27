import { Design } from '@valenced/discord/design'
import { View } from 'react-native'
import type { ReactNode } from 'react'

/**
 * A slider (or another control) as a real table row: the control and its explanation go in the
 * row's `subLabel`, so it sits on the same surface as the rows around it. The way Better Typing
 * Indicators draws its "Maximum avatars" slider.
 */
export function FieldRow({
	label,
	description,
	children,
}: {
	label: string
	description?: string
	children: ReactNode
}) {
	const { TableRow, Text } = Design
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
