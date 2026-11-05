import { getAssetIdByName } from '@valenced/assets'
import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { getComponentName, isComponent, isRecord } from './guards'
import { acquireButtonId, releaseButton, reportButtonHeight } from './layout'
import { markAllAsRead } from './unread'
import type { LayoutChangeEvent } from 'react-native'
import type { AnyComponent, AnyProps } from './guards'

const { IconButton } = Design

const EntryComponentName = 'GuildsBarAnimatedItemWrapper'
const DirectMessagesLabel = 'Direct Messages'
const ContainerMarginTop = 6
const ContainerMarginBottom = 2

function ReadAllButton() {
	const id = useButtonId()

	const onLayout = (event: LayoutChangeEvent) => {
		const { height } = event.nativeEvent.layout
		reportButtonHeight(id, height + ContainerMarginTop + ContainerMarginBottom)
	}

	return (
		<View style={styles.container} onLayout={onLayout}>
			<IconButton
				accessibilityLabel="Mark all as read"
				variant="secondary"
				size="md"
				icon={getAssetIdByName('ChatCheckIcon')!}
				onPress={markAllAsRead}
			/>
		</View>
	)
}

function useButtonId(): number {
	const [id] = useState(acquireButtonId)

	useEffect(() => () => releaseButton(id), [id])

	return id
}

export function createDirectMessagesEntryPatcher() {
	const wrappers = new WeakMap<object, AnyComponent>()
	const wrapperTypes = new WeakSet<object>()
	let renderingWrapper = false

	function wrap(Original: AnyComponent): AnyComponent {
		const existing = wrappers.get(Original)
		if (existing) return existing

		function ReadAllDmWrapper(props: AnyProps) {
			renderingWrapper = true
			try {
				return (
					<>
						<Original {...props} />
						<ReadAllButton />
					</>
				)
			} finally {
				renderingWrapper = false
			}
		}

		wrappers.set(Original, ReadAllDmWrapper)
		wrapperTypes.add(ReadAllDmWrapper)
		return ReadAllDmWrapper
	}

	function isEntryType(type: unknown): type is AnyComponent {
		return (
			!renderingWrapper &&
			isComponent(type) &&
			!wrapperTypes.has(type) &&
			getComponentName(type) === EntryComponentName
		)
	}

	function isDirectMessagesProps(props: unknown): props is AnyProps {
		return isRecord(props) && props.label === DirectMessagesLabel
	}

	return function patchEntry<Args extends [unknown, unknown?, ...unknown[]]>(
		args: Args,
	): Args {
		const [type, props] = args
		if (!isDirectMessagesProps(props) || !isEntryType(type)) return args

		args[0] = wrap(type)
		return args
	}
}

const styles = StyleSheet.create({
	container: {
		alignItems: 'center',
		marginBottom: ContainerMarginBottom,
		marginTop: ContainerMarginTop,
	},
})
