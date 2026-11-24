import { getAssetIdByName } from '@valenced/assets'
import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import {
	getComponentName,
	isComponent,
	isFavoritesLabel,
	isRecord,
} from './guards'
import {
	acquireButtonId,
	isFavoritesSeen,
	markFavoritesSeen,
	releaseButton,
	reportButtonHeight,
	subscribeFavorites,
} from './layout'
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

function useShowOnDm(): boolean {
	const [show, setShow] = useState(false)

	useEffect(() => {
		const check = () => setShow(!isFavoritesSeen())
		const timer = setTimeout(check, 0)
		const unsubscribe = subscribeFavorites(check)
		return () => {
			clearTimeout(timer)
			unsubscribe()
		}
	}, [])

	return show
}

export function createEntryPatcher() {
	const wrappers = new WeakMap<object, AnyComponent>()
	const wrapperTypes = new WeakSet<object>()
	let renderingWrapper = false

	function wrap(Original: AnyComponent) {
		const existing = wrappers.get(Original)
		if (existing) return existing

		function ReadAllEntryWrapper(props: AnyProps) {
			renderingWrapper = true
			try {
				const label = isRecord(props) ? props.label : undefined
				const isFavorites = isFavoritesLabel(label)

				if (isFavorites) markFavoritesSeen()

				const showOnDm = useShowOnDm()
				const showButton = isFavorites || showOnDm

				return (
					<>
						<Original {...props} />
						{showButton ? <ReadAllButton /> : null}
					</>
				)
			} finally {
				renderingWrapper = false
			}
		}

		wrappers.set(Original, ReadAllEntryWrapper)
		wrapperTypes.add(ReadAllEntryWrapper)
		return ReadAllEntryWrapper
	}

	function isEntryType(type: unknown): type is AnyComponent {
		return (
			!renderingWrapper &&
			isComponent(type) &&
			!wrapperTypes.has(type) &&
			getComponentName(type) === EntryComponentName
		)
	}

	function isLabeledProps(props: unknown, label: string): props is AnyProps {
		return isRecord(props) && props.label === label
	}

	return function patchEntry<Args extends [unknown, unknown?, ...unknown[]]>(
		args: Args,
	): Args {
		const [type, props] = args
		if (!isEntryType(type)) return args

		if (
			!isLabeledProps(props, DirectMessagesLabel) &&
			!isFavoritesLabel(props.label)
		) {
			return args
		}

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
