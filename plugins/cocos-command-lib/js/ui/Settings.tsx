import Page from '@valenced/components/Page'
import { Design } from '@valenced/discord/design'
import { ReactNative } from '@valenced/react'
import Commands from './Commands'
import DonateCard from './DonateCard'

// thank u for most of this ui kmmiioo :)
export default function Settings() {
	const { ScrollView, View } = ReactNative
	const { Stack } = Design

	return (
		<Page>
			<View style={{ flex: 1, position: 'relative' }}>
				<ScrollView contentContainerStyle={{ padding: 0 }}>
					<Stack>
						<DonateCard />
						<Commands />
					</Stack>
				</ScrollView>
			</View>
		</Page>
	)
}
