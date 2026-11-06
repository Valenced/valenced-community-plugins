export type AnyProps = Record<string, unknown>

export function isRecord(value: unknown): value is AnyProps {
	return typeof value === 'object' && value !== null
}
