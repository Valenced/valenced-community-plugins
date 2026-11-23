import { before } from '@valenced/patcher'
import { ReactJSXRuntime } from '@valenced/react'
import { rewriteUri } from './cdn'
import { isRecord } from './guards'

function rewriteSource(value: unknown): unknown {
	if (!isRecord(value)) return value

	const { uri } = value
	if (typeof uri !== 'string') return value

	const next = rewriteUri(uri)
	return next === uri ? value : { ...value, uri: next }
}

function rewriteProps(props: Record<string, unknown>): Record<string, unknown> | undefined {
	const { source, uri } = props
	let changed = false

	let nextSource: unknown = source
	if (Array.isArray(source)) {
		const mapped = source.map(rewriteSource)
		if (mapped.some((item, index) => item !== source[index])) {
			nextSource = mapped
			changed = true
		}
	} else if (isRecord(source)) {
		const rewritten = rewriteSource(source)
		if (rewritten !== source) {
			nextSource = rewritten
			changed = true
		}
	}

	let nextUri = uri
	if (typeof uri === 'string') {
		const rewritten = rewriteUri(uri)
		if (rewritten !== uri) {
			nextUri = rewritten
			changed = true
		}
	}

	if (!changed) return undefined

	const next = { ...props }
	if (nextSource !== source) next.source = nextSource
	if (nextUri !== uri) next.uri = nextUri
	return next
}

function patchImage<Args extends [unknown, unknown?, ...unknown[]]>(args: Args): Args {
	const props = args[1]
	if (!isRecord(props)) return args
	if (!('source' in props) && typeof props.uri !== 'string') return args

	const next = rewriteProps(props)
	if (!next) return args

	args[1] = next
	return args
}

export default plugin({
	start({ cleanup, plugin }) {
		if (plugin.startedLate) {
			plugin.requireReload()
			return
		}

		cleanup(
			before(ReactJSXRuntime, 'jsx', patchImage),
			before(ReactJSXRuntime, 'jsxs', patchImage),
		)
	},
})
