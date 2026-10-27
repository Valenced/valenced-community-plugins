/**
 * Errors go to the plugin's error list, once per distinct message: the send hook and the chat input's
 * render are hot paths, and `plugin.errors` is never trimmed. `context` says what failed and becomes
 * the start of the message; the original stack is kept.
 */

let reporter: { reportError(error: unknown): void } | undefined
const seen = new Set<string>()

export function setReporter(
	plugin: { reportError(error: unknown): void } | undefined,
) {
	reporter = plugin
}

export function reportError(context: string, error?: unknown) {
	const message =
		error === undefined
			? context
			: `${context} ${error instanceof Error ? error.message : String(error)}`
	if (seen.has(message)) return
	seen.add(message)
	const wrapped = new Error(message)
	if (error instanceof Error && error.stack)
		wrapped.stack = `${wrapped.name}: ${message}\n${error.stack.split('\n').slice(1).join('\n')}`
	try {
		reporter?.reportError(wrapped)
	} catch {
		/* reporting must never throw into the caller */
	}
}
