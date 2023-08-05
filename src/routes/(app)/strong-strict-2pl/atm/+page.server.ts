import { errorFrom } from '$lib/error.js';
import { server } from '$lib/ss2pl/server.js';
import { fail } from '@sveltejs/kit';

export type Operation = { type: string; account?: string; value?: number };

export async function load() {
	const timestamp = server.startTransaction();
	console.log('Timestamp:', timestamp);
	return {
		timestamp,
		numAccounts: server.numAccounts(timestamp),
		accounts: {
			balances: server.allBalances(timestamp).catch((e) => {
				console.log('Error getting balances', e);
				throw new Error('oopsie');
			}),
		},
		operations: [
			{ type: 'begin' },
			...server.allAccountNames(timestamp).map((name) => ({ type: 'balance', account: name })),
		] as Operation[],
	};
}

export const actions = {
	async deposit({ request }) {
		const formData = await request.formData();
		const timestamp = Number(formData.get('timestamp'));
		const account = formData.get('account') as unknown as string;
		const amount = Number(formData.get('amount'));
		try {
			await server.deposit(timestamp, account, amount);
			return { balance: await server.balance(timestamp, account) };
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
			return { balance: await server.balance(timestamp, account) };
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
		console.log('ABORTING:', timestamp);
		try {
			await server.abort(timestamp);
		} catch (e) {
			return fail(400, { message: errorFrom(e).message });
		}
	},
};
