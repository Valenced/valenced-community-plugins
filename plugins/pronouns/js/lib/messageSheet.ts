import { isValidElement } from 'react'
import type { ReactElement, ReactNode } from 'react'

interface ElementWithChildren extends ReactElement {
	props: { children?: ReactNode }
}

/**
 * The element inside the message action sheet whose children are the row groups, so a group can
 * be added beside Discord's own. Only inside the actual sheet, never beside its outer provider
 * or portal.
 */
export function findMessageSheetGroupParent(
	tree: ReactNode,
	Sheet: unknown,
	Group: unknown,
): ElementWithChildren | undefined {
	if (!Sheet || !Group) return undefined
	const visit = (
		node: ReactNode,
		inside: boolean,
		depth: number,
	): ElementWithChildren | undefined => {
		if (!node || depth > 40) return undefined
		if (Array.isArray(node)) {
			for (const child of node) {
				const found = visit(child, inside, depth + 1)
				if (found) return found
			}
			return undefined
		}
		if (!isValidElement(node)) return undefined
		const element = node as ElementWithChildren
		const inSheet = inside || element.type === Sheet
		const children = element.props.children
		const groups = Array.isArray(children) ? children : [children]
		if (
			inSheet &&
			groups.some(child => isValidElement(child) && child.type === Group)
		)
			return element
		return visit(children, inSheet, depth + 1)
	}
	return visit(tree, false, 0)
}
