import { getAssetIdByName } from '@valenced/assets'
import { Design } from '@valenced/discord/design'
import { lookupGeneratedIconComponent } from '@valenced/utils/discord'

/**
 * A leading icon for a settings row, by icon name. Older icons are registry assets
 * (`getAssetIdByName`); Discord's newer set are generated components that only
 * `lookupGeneratedIconComponent` can see. Each name is tried both ways before the next; if every
 * name misses, the row gets no icon rather than a broken image.
 *
 * Call from inside a render, never at module scope: the lookups are only safe once Discord has loaded.
 */
export function rowIcon(...names: [string, ...string[]]) {
	return findIcon(names, false)
}

/** The same, for a `variant="danger"` row: the icon takes the danger colour separately. */
export function dangerIcon(...names: [string, ...string[]]) {
	return findIcon(names, true)
}

function findIcon(names: [string, ...string[]], danger: boolean) {
	const Icon = Design.TableRow.Icon
	for (const name of names) {
		const source = getAssetIdByName(name) || undefined
		const Component = lookupGeneratedIconComponent(name)
		if (danger) {
			if (Component || source)
				return (
					<Icon source={source} IconComponent={Component} variant="danger" />
				)
			continue
		}
		if (source) return <Icon source={source} />
		if (Component) return <Component />
	}
	return undefined
}
