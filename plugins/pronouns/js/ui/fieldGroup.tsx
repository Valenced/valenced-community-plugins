import { Design } from '@valenced/discord/design'
import { View } from 'react-native'
import type { ReactNode } from 'react'

interface FieldRowProps {
	/** The row's label: names the field. */
	label: string
	/** Muted text under the field, inside the row. */
	description?: ReactNode
	children: ReactNode
}

/**
 * A text field in a row, so it sits on the same background as the row groups around it. The
 * field (and its explanation) is the row's `subLabel`, so the row paints its surface.
 */
export function FieldRow({ label, description, children }: FieldRowProps) {
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

/** A group holding one field row, with an optional heading. */
export function FieldGroup({
	title,
	...row
}: FieldRowProps & { title?: string }) {
	const { TableRowGroup } = Design
	return (
		<TableRowGroup title={title}>
			<FieldRow {...row} />
		</TableRowGroup>
	)
}
