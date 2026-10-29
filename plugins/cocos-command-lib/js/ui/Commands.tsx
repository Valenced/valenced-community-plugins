import { Design } from '@valenced/discord/design'
import { ReactNative } from '@valenced/react'
import { getCommands } from '../commands'
import type { ApplicationCommand } from '../types'

function CommandCard({ command }: { command: ApplicationCommand }) {
	const { Card, Text } = Design
	const { View } = ReactNative

	return (
		<Card>
			<View style={{ gap: 4 }}>
				<Text variant="heading-md/semibold">
					/{command.displayName ?? command.name}
				</Text>
				<Text variant="text-sm/normal">
					{command.displayDescription ?? command.description}
				</Text>
			</View>
		</Card>
	)
}

export default function Commands() {
	const { FlatList, View } = ReactNative
	const { Text } = Design

	return (
		<View>
			{getCommands().length > 0 ? (
				<Text style={{ paddingTop: 12 }}>Commands using this library:</Text>
			) : (
				<></>
			)}
			<FlatList
				data={getCommands()}
				keyExtractor={(item: ApplicationCommand) => item.id!}
				renderItem={({ item }) => <CommandCard command={item} />}
				ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
				contentContainerStyle={{ padding: 12 }}
				scrollEnabled={false}
			/>
		</View>
	)
}
