/**
 * Errors go to the plugin's error list through `plugin.reportError`, each distinct message once
 * per session. The patches run on every chat row, and the plugin's error list is never trimmed, so
 * reporting every repeat of one failure would grow it without bound.
 */

interface Reporter {
	reportError(error: unknown): void
}

let reporter: Reporter | undefined
const seen = new Set<string>()

export function setReporter(plugin: Reporter | undefined) {
	reporter = plugin
}

/** Reports [error] with [context] in front of its message, keeping the original stack. */
export function reportError(context: string, error?: unknown) {
	const message = error instanceof Error ? error.message : String(error ?? '')
	const key = `${context} ${message}`
	if (seen.has(key)) return
	seen.add(key)
	const wrapped = new Error(message ? key : context)
	if (error instanceof Error && error.stack)
		wrapped.stack = `Error: ${wrapped.message}\n${error.stack.split('\n').slice(1).join('\n')}`
	try {
		reporter?.reportError(wrapped)
	} catch {
		/* reporting must never throw into the caller */
	}
}
