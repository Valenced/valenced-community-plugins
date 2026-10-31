import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { getModules } from '@valenced/modules/finders'
import { withName } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { lookupGeneratedIconComponent } from '@valenced/utils/discord'
import { Children, cloneElement, isValidElement } from 'react'
import { getQuoteMedia } from './lib/content'
import { closeQuoteModal, openQuoteModal } from './preview'
import Settings from './settings'
import {
	configureStorage,
	defaults,
	loadSettings,
	quoterSettings,
	setActive,
} from './storage'
import type { DiscordModules } from '@valenced/discord/types'
import type { ComponentType, ReactNode } from 'react'
import type { QuoteMessage, QuoterSettings, TreeProps } from './types'

export default plugin<{ jsonStorage: QuoterSettings }>({
	jsonStorage: { default: defaults },
	SettingsComponent: Settings,
	async start(api) {
		const { cleanup, jsonStorage, plugin } = api
		if (plugin.startedLate) {
			plugin.requireReload()
			return
		}
		let stopped = false
		cleanup(() => {
			stopped = true
			setActive(false)
			closeQuoteModal()
		})
		configureStorage(jsonStorage)
		await loadSettings()
		if (stopped) return
		setActive(true)
		cleanup(
			getModules(
				withName('LongPressMessageActionSheet'),
				module => {
					const target = module as {
						default: (props: { message?: QuoteMessage }) => ReactNode
					}
					cleanup(
						instead(target, 'default', function (args, original) {
							const result = Reflect.apply(original, this, args)
							const message = args[0].message
							if (
								!message ||
								(!message.content &&
									!(quoterSettings.allowMedia && getQuoteMedia(message).length))
							)
								return result
							let inserted = false
							const add = (node: ReactNode): ReactNode => {
								if (!isValidElement<TreeProps>(node)) return node
								const children = Children.toArray(node.props.children)
								if (
									!inserted &&
									node.props.hasIcons &&
									children.some(
										child =>
											isValidElement<TreeProps>(child) &&
											typeof child.props.label === 'string',
									)
								) {
									const template = children.find(
										child =>
											isValidElement<TreeProps>(child) &&
											typeof child.props.label === 'string',
									)
									if (isValidElement<TreeProps>(template)) {
										inserted = true
										const Row = template.type as ComponentType<{
											label: string
											icon?: ReactNode
											onPress(): void
										}>
										const icon = isValidElement(template.props.icon)
											? cloneElement(
													template.props.icon as React.ReactElement<{
														IconComponent: DiscordModules.Components.BaseIconImage
													}>,
													{
														IconComponent:
															lookupGeneratedIconComponent('QuoteIcon')!,
													},
												)
											: undefined
										return cloneElement(
											node,
											{},
											...children,
											<Row
												key="quoter"
												label="Quote"
												icon={icon}
												onPress={() => {
													ActionSheetActionCreators.hideAllActionSheets()
													openQuoteModal(message, api)
												}}
											/>,
										)
									}
								}
								return cloneElement(
									node,
									{},
									Children.map(node.props.children, add),
								)
							}
							return add(result)
						}),
					)
				},
				{ returnNamespace: true },
			),
		)
	},
})
