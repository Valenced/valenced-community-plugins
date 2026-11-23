import { lookupModule } from '@valenced/modules/finders'
import {
	withDependencies,
	withName,
	withProps,
} from '@valenced/modules/finders/filters'
import { proxify } from '@valenced/utils/proxy'

const { relative, ordered } = withDependencies

type MessageActionCreators = {
	jumpToMessage(config: {
		channelId?: string
		messageId?: string
		flash?: boolean
		jumpType?: string
	}): void
}

export let MessageActionCreators: MessageActionCreators = proxify(
	() => {
		const [, SlicedToArrayModuleId] = lookupModule(withName('_slicedToArray'))!
		const [, AsyncToGeneratorModuleId] = lookupModule(
			withName('_asyncToGenerator'),
		)

		const [module] = lookupModule(
			withProps<MessageActionCreators>('jumpToMessage').and(
				withDependencies(
					ordered([
						SlicedToArrayModuleId,
						AsyncToGeneratorModuleId,
						relative(1),
						relative(2),
					]),
				),
			),
		)

		if (module) return (MessageActionCreators = module)
	},
	{ hint: {} },
)!
