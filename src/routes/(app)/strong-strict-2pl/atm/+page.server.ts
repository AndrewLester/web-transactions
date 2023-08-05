import { serverPageFunctions } from '$lib/server';
import { server } from '$lib/ss2pl/server';

const { load, actions } = serverPageFunctions(server);

export { load, actions };
