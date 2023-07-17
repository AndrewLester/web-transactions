import { errorFrom } from '$lib/error.js';
import { server } from '$lib/server.js';
import { fail, type Actions, redirect } from '@sveltejs/kit';

export async function load({ cookies, url }) {
	const timestamp = server.startTransaction();
	console.log('Timestamp:', timestamp);
	return {
		timestamp,
		accounts: {
			balances: server.allBalances(timestamp).catch((e) => {
				console.log(e);
				cookies.set('timestamp', server.startTransaction().toString());
				throw redirect(301, url.pathname);
			}),
		},
	};
}

export const actions: Actions = {
	async deposit({ request }) {
		const formData = await request.formData();
		const timestamp = Number(formData.get('timestamp'));
		const account = formData.get('account') as unknown as string;
		const amount = Number(formData.get('amount'));
		try {
			await server.deposit(timestamp, account, amount);
			return await server.balance(timestamp, account);
		} catch (e) {
			return fail(400, { message: errorFrom(e).message });
		}
	},

	async withdraw({ request }) {
		const formData = await request.formData();
		const timestamp = Number(formData.get('timestamp'));
		const account = formData.get('account') as unknown as string;
		const amount = Number(formData.get('amount'));
		try {
			await server.withdraw(timestamp, account, amount);
			return await server.balance(timestamp, account);
		} catch (e) {
			return fail(400, { message: errorFrom(e).message });
		}
	},

	async commit({ request }) {
		const formData = await request.formData();
		const timestamp = Number(formData.get('timestamp'));
		try {
			await server.commit(timestamp);
		} catch (e) {
			return fail(400, { message: errorFrom(e).message });
		}
	},

	async abort({ request }) {
		const formData = await request.formData();
		const timestamp = Number(formData.get('timestamp'));
		try {
			await server.abort(timestamp);
		} catch (e) {
			return fail(400, { message: errorFrom(e).message });
		}
	},
};
