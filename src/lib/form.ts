import { invalidateAll } from '$app/navigation';
import type { ActionResult, SubmitFunction } from '@sveltejs/kit';

export type OperationSuccess = { balance: number };

export type OperationSuccessResult = Extract<ActionResult<OperationSuccess>, { type: 'success' }>;

export function operation({
	success,
	abort,
	start,
}: {
	success?: (action: URL, formData: FormData, result: OperationSuccessResult) => void;
	abort?: (error?: string) => void;
	start?: () => void;
}) {
	return () => {
		start?.();

		const actionReturnHandler: ReturnType<SubmitFunction<OperationSuccess>> = async ({
			action,
			formElement,
			formData,
			result,
		}) => {
			if (result.type !== 'success') {
				abort?.((result as any)?.data?.message);
				return;
			}
			success?.(action, formData, result);
			formElement.reset();
		};
		return actionReturnHandler;
	};
}

export function transaction({
	success,
	abort,
}: {
	success?: (action: URL) => void;
	abort?: (error?: string) => void;
}) {
	return () => {
		const actionReturnHandler: ReturnType<SubmitFunction> = async ({ action, result }) => {
			if (result.type === 'failure') {
				abort?.((result as any)?.data?.message);
			} else {
				success?.(action);
			}
			invalidateAll();
		};
		return actionReturnHandler;
	};
}
