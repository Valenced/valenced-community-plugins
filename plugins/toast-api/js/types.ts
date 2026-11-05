import type { ComponentType, ReactNode } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'

export type ToastPosition = 'top' | 'bottom'
export type ToastIconSide = 'left' | 'right'
export type ToastVariant =
	| 'default'
	| 'success'
	| 'critical'
	| 'warning'
	| 'info'
export type ToastDurationMode = 'toast' | 'default' | 'override'

export type ToastTextVariant = string

export interface ToastIconEntity {
	type: string
	unicode?: string
	src?: string
	alt?: string
}

export interface ToastInput {
	/** Optional dedupe key; `update` and `close` still use the returned id. */
	key?: string
	content: ReactNode
	subtitle?: ReactNode
	/** Packager asset id, or a function returning arbitrary nodes. */
	icon?: number | (() => ReactNode)
	/** Mana-style `{ type: 'emoji' | 'image', ... }` icon. */
	iconEntity?: ToastIconEntity
	IconComponent?: ComponentType<any>
	/** Semantic token name or `#hex`. Resolved before it reaches the icon. */
	iconColor?: string
	recolorLegacyIcon?: boolean
	/** A second icon, drawn on the side opposite the first one. */
	secondIcon?: number | (() => ReactNode)
	secondIconEntity?: ToastIconEntity
	SecondIconComponent?: ComponentType<any>
	secondIconColor?: string
	/** Overrides the configured icon side for this toast. */
	iconSide?: ToastIconSide
	variant?: ToastVariant
	containerStyle?: StyleProp<ViewStyle>
	duration?: number
	position?: ToastPosition
	onDismiss?: () => void
	/** Makes the toast pressable; the handler receives its id. */
	onPress?: (id: string) => void
	/** Keep the toast open after a press. Defaults to `true`. */
	closeOnPress?: boolean
}

export interface ToastEntry extends ToastInput {
	id: string
	key: string
	content: ReactNode
	variant: ToastVariant
	durationMs: number
	position: ToastPosition
	createdAt: number
}

export interface ToastApiSettings {
	position: ToastPosition
	/** Maximum visible toasts. `0` means unlimited. */
	maxVisible: number

	durationMode: ToastDurationMode
	defaultDurationMs: number
	overrideDurationMs: number
	minDurationMs: number
	maxDurationMs: number

	radius: number
	paddingY: number
	paddingX: number
	gap: number
	borderWidth: number
	shadow: boolean
	maxWidth: number
	iconSize: number
	/** Which side of the text the toast's icon sits on. */
	iconSide: ToastIconSide
	/** Show the variant icon opposite a toast's custom icon. */
	showSecondIcon: boolean
	lineClamp: number

	textVariant: ToastTextVariant
	/** `0` keeps the variant's own size. */
	textSize: number
	/** Semantic token name or `#hex`. Empty keeps `mobile-text-heading-primary`. */
	textColor: string
	fontFamily: string
	/** `#hex`. Empty keeps `MOBILE_TOAST_BACKGROUND_DEFAULT`. */
	backgroundColor: string
	/** `#hex`. Empty keeps `BORDER_SUBTLE`. */
	borderColor: string

	showSubtitle: boolean
	subtitleVariant: ToastTextVariant

	/** Route Discord's toast calls through this renderer. */
	overrideDiscordToasts: boolean
}
