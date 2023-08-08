import type { ParamMatcher } from '@sveltejs/kit';

const ccTypesRegex = /^(timestamp-based|strong-strict-2pl)$/;

export const match = ((param) => {
	return ccTypesRegex.test(param);
}) satisfies ParamMatcher;
