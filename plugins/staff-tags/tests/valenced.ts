/// <reference types="node" />
/**
 * Stand-ins for the `@valenced/*` modules the tested files import.
 *
 * In the app, the build turns each `@valenced/*` import into a read of the `valenced` global, so
 * there is no package to load under `bun test`. Importing this file registers a stand-in for each
 * module the tested code uses. Every export does nothing until a test gives it an implementation
 * with `mockValenced`: called, it calls that implementation; read as an object, it reads the
 * implementation's properties.
 *
 * Import this before the code under test, and import that code with `await import(...)`, so the
 * stand-ins exist when it loads.
 */

// @ts-expect-error Bun's types aren't installed in this repository; these tests run under `bun test`.
import { mock } from 'bun:test'

/** The exports each stand-in module has, by module name. */
const MODULES: Record<string, string[]> = {
	'@valenced/discord/flux': ['Stores'],
	'@valenced/modules/finders': ['getModules', 'lookupModules'],
	'@valenced/modules/finders/filters': ['withProps'],
}

const impls = new Map<string, Record<string, unknown>>()

function standIn(specifier: string, name: string): unknown {
	const current = () => impls.get(specifier)?.[name]
	return new Proxy(() => undefined, {
		apply: (_target, thisArg, args) => {
			const impl = current()
			return typeof impl === 'function'
				? Reflect.apply(impl, thisArg, args)
				: undefined
		},
		get: (_target, key) => {
			const impl = current()
			return impl == null ? undefined : Reflect.get(impl as object, key)
		},
	})
}

for (const [specifier, names] of Object.entries(MODULES)) {
	mock.module(specifier, () =>
		Object.fromEntries(names.map(name => [name, standIn(specifier, name)])),
	)
}

/** Gives [specifier]'s exports a real implementation. Returns a function that takes it away again. */
export function mockValenced(
	specifier: string,
	impl: Record<string, unknown>,
): () => void {
	if (!(specifier in MODULES))
		throw new Error(`tests/valenced.ts has no stand-in for ${specifier}`)
	const previous = impls.get(specifier)
	impls.set(specifier, { ...previous, ...impl })
	return () => {
		if (previous) impls.set(specifier, previous)
		else impls.delete(specifier)
	}
}
