import type { Server } from './server';
import type { Timestamp } from './timestamp';

export function errorIs(e: unknown, error: Error): boolean {
	if (e === undefined) {
		return false;
	}
	const testError = errorFrom(e);
	return testError.message === error.message || errorIs(testError.cause, error);
}

export function errorFrom(e: unknown): Error {
	return e instanceof Error ? e : new Error(e as any);
}

export function abortError(errorFunction: () => Error) {
	return (server?: Server, timestamp?: Timestamp) => {
		if (server) {
			console.log('Aborting due to error:', timestamp, errorFunction().message);
		}
		server?.abort(timestamp!);
		return errorFunction();
	};
}
