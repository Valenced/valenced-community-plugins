import { getAssetIdByName } from '@valenced/assets'
import { ConstantsModuleId } from '@valenced/discord/common/constants'
import { lookupModule } from '@valenced/modules/finders'
import { withDependencies, withProps } from '@valenced/modules/finders/filters'
import { proxify } from '@valenced/utils/proxy'

const { relative, ordered } = withDependencies

type ChannelRouter = {
	transitionToChannel(id: string): void
}

export let ChannelRouter: ChannelRouter = proxify(
	() => {
		const [module] = lookupModule(
			withProps('transitionToChannel', 'transitionToThread').and(
				withDependencies(
					ordered([ConstantsModuleId, relative(1), relative(2)]),
				),
			),
		)

		if (module) return (ChannelRouter = module)
	},
	{ hint: {} },
)!

export const Icons = proxify(
	() => {
		return {
			ArrowLargeDownIcon: getAssetIdByName('ArrowLargeDownIcon')!,
			ArrowLargeUpIcon: getAssetIdByName('ArrowLargeUpIcon')!,
		}
	},
	{ cache: true, hint: {} },
)
