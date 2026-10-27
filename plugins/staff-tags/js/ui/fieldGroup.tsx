/**
 * A text field (or a few related ones) in a row, so it sits on the same background as the row
 * groups around it instead of floating on the page. The field and its explanation go in the row's
 * `subLabel`, so the row paints its surface.
 *
 * Read `Design` inside the render, never at module scope (a lookup at module scope can run before
 * Discord's design module exists).
 */

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

/** One field as a table row. Put several in one `TableRowGroup` for related fields. */
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
