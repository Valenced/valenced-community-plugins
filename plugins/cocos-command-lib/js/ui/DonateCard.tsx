import { Design } from '@valenced/discord/design'
import { ReactNative } from '@valenced/react'
import { getAssetIdByName } from '@valenced/assets'
import { AVATAR_URL, GITHUB_URL, SPONSORS_URL, WEBSITE_URL } from './constants'

const { Dimensions } = ReactNative
const { width: SCREEN_WIDTH } = Dimensions.get('window')
const AVATAR_SIZE = Math.min(80, Math.round(SCREEN_WIDTH * 0.15))

const styles = {
	background: {
		position: 'absolute' as const,
		top: 0,
		left: 0,
		width: '100%' as const,
		height: '100%' as const,
	},
	avatar: {
		width: AVATAR_SIZE,
		height: AVATAR_SIZE,
		borderRadius: AVATAR_SIZE / 2,
	},
	avatarWrapper: {
		width: AVATAR_SIZE,
		height: AVATAR_SIZE,
	},
}

export default function DonateCard() {
	const { Card, Text, Button } = Design
	const { Animated, Image, Linking, View } = ReactNative

	return (
		<Card
			style={{
				position: 'relative',
				padding: 0,
				overflow: 'hidden',
			}}
		>
			<View
				style={[
					styles.background,
					{
						opacity: 0.5,
						experimental_backgroundImage:
							'linear-gradient(135deg, rgba(88, 101, 242, 0.4), rgba(0, 0, 0, 0)), ' +
							'linear-gradient(45deg, rgba(0, 0, 0, 0), rgba(88, 101, 242, 0.3))',
					},
				]}
			/>
			<View
				style={{ flexDirection: 'row', padding: 16, alignItems: 'flex-start' }}
			>
				<View style={{ flex: 1, marginRight: 16 }}>
					<View style={{ marginBottom: 6 }}>
						<Text variant="heading-lg/semibold" color="text-strong">
							Support cocobo1
						</Text>
					</View>
					<View style={{ marginBottom: 12 }}>
						<Text variant="text-md/medium">
							You can support the development of my plugins by sponsoring on
							GitHub!
						</Text>
					</View>
					<View
						style={{
							flexDirection: 'row',
							flexWrap: 'wrap',
							gap: 8,
							alignItems: 'center',
						}}
					>
						<Button
							size="sm"
							icon={getAssetIdByName('HeartIcon')}
							text="Sponsor"
							variant="expressive"
							onPress={() => Linking.openURL(SPONSORS_URL)}
						/>
						<Button
							size="sm"
							icon={getAssetIdByName(
								'img_account_sync_github_light',
							)}
							text="GitHub"
							variant="primary-overlay"
							onPress={() => Linking.openURL(GITHUB_URL)}
						/>
						<Button
							size="sm"
							icon={getAssetIdByName('GlobeEarthIcon')}
							text="Website"
							variant="tertiary"
							onPress={() => Linking.openURL(WEBSITE_URL)}
						/>
					</View>
				</View>
				<Animated.View
					style={{
						width: AVATAR_SIZE,
						height: AVATAR_SIZE,
						borderRadius: AVATAR_SIZE / 2,
					}}
				>
					<Image source={{ uri: AVATAR_URL }} style={styles.avatar} />
				</Animated.View>
			</View>
		</Card>
	)
}
