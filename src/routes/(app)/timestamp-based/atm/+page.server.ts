import { serverPageFunctions } from '$lib/server';
import { server } from '$lib/tbcc/server';

const { load, actions } = serverPageFunctions(server);

export { load, actions };
