import { serverPageFunctions, type Server } from '$lib/server';
import { server as tbccServer } from '$lib/tbcc/server';
import { server as ss2plServer } from '$lib/ss2pl/server';

const { load, actions } = serverPageFunctions(({ params }) => {
	let server = tbccServer as Server;
	if (params.ccType === 'strong-strict-2pl') {
		server = ss2plServer;
	}
	return server;
});

export { load, actions };
