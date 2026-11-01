let report: (error: unknown) => void = error => {
	throw error
}

export function setErrorReporter(handler: (error: unknown) => void): void {
	report = handler
}

export function reportError(error: unknown): void {
	report(error)
}
