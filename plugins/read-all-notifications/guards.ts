import type { ComponentType } from 'react'

export type AnyProps = Record<string, unknown>
export type AnyComponent = ComponentType<AnyProps>

export function isRecord(value: unknown): value is AnyProps {
	return typeof value === 'object' && value !== null
}

export function isComponent(value: unknown): value is AnyComponent {
	return typeof value === 'function' || isRecord(value)
}

interface ComponentLike extends AnyProps {
	displayName?: unknown
	name?: unknown
	type?: unknown
	render?: unknown
}

export function getComponentName(type: unknown, depth = 0): string | undefined {
	if (depth > 4 || !isComponent(type)) return undefined

	const {
		displayName,
		name,
		type: inner,
		render,
	} = type as unknown as ComponentLike
	if (typeof displayName === 'string' && displayName) return displayName
	if (typeof name === 'string' && name) return name

	return (
		getComponentName(inner, depth + 1) ?? getComponentName(render, depth + 1)
	)
}
