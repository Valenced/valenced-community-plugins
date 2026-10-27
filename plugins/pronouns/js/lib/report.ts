/**
 * Errors go to `plugin.reportError`, which Valenced shows in the plugin list, with each distinct
 * message reported once per session: the chat hook runs for every row, and a failure there would
 * otherwise grow the plugin's error list without bound.
 *
 * `start()` calls `setReporter(plugin)` and clears it on cleanup.
 */

interface Reporter {
	reportError(e: unknown): void
}

let reporter: Reporter | undefined
const seen = new Set<string>()

export function setReporter(plugin: Reporter | undefined) {
	reporter = plugin
	seen.clear()
}

/** [context] says what failed and starts the message; the original stack is kept. */
export function reportError(context: string, error?: unknown) {
	const wrapped = withContext(context, error)
	const key = wrapped instanceof Error ? wrapped.message : String(wrapped)
	if (seen.has(key)) return
	seen.add(key)
	try {
		reporter?.reportError(wrapped)
	} catch {
		/* reporting must never throw into the caller */
	}
}

function withContext(context: string, error: unknown): unknown {
	if (error === undefined) return new Error(context)
	if (!context) return error
	const message = error instanceof Error ? error.message : String(error)
	const wrapped = new Error(`${context} ${message}`)
	if (error instanceof Error && typeof error.stack === 'string') {
		const frames = error.stack.split('\n').slice(1).join('\n')
		if (frames) wrapped.stack = `${wrapped.name}: ${wrapped.message}\n${frames}`
	}
	return wrapped
}
