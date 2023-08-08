import { fail, type Actions, type Load } from '@sveltejs/kit';
import { errorFrom } from './error';
import type { Timestamp } from './timestamp';

export interface Account {
	name: string;
}

export interface Server {
	startTransaction(): Timestamp;
	deposit(timestamp: Timestamp, account: Account['name'], amount: number): Promise<void>;
	withdraw(timestamp: Timestamp, account: Account['name'], amount: number): Promise<void>;
	balance(timestamp: Timestamp, account: Account['name']): Promise<number>;
	allAccountNames(timestamp: Timestamp): string[];
	allBalances(timestamp: Timestamp): Promise<{ name: string; balance: number }[]>;
	commit(timestamp: Timestamp): Promise<void>;
	abort(timestamp: Timestamp): Promise<void>;
	numAccounts(timestamp: Timestamp): number;
}

export type Operation = { type: string; account?: string; value?: number };

export function serverPageFunctions(
	getServer: ({ params }: Pick<Parameters<Load>[0], 'params'>) => Server
) {
	return {
		async load({ params }) {
			const server = getServer({ params });
			const timestamp = server.startTransaction();
			console.log('Timestamp:', timestamp);
			return {
				timestamp,
				numAccounts: server.numAccounts(timestamp),
				accounts: {
					balances: server.allBalances(timestamp).catch((e) => {
						console.log('Error getting balances', e);
						return [];
					}),
				},
				operations: [
					{ type: 'begin' },
					...server.allAccountNames(timestamp).map((name) => ({ type: 'balance', account: name })),
				] as Operation[],
			};
		},
		actions: {
			async deposit({ request, params }) {
				const server = getServer({ params });
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

			async withdraw({ request, params }) {
				const server = getServer({ params });
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

			async commit({ request, params }) {
				const server = getServer({ params });
				const formData = await request.formData();
				const timestamp = Number(formData.get('timestamp'));
				console.log('COMMIT:', timestamp);
				try {
					await server.commit(timestamp);
				} catch (e) {
					return fail(400, { message: errorFrom(e).message });
				}
			},

			async abort({ request, params }) {
				const server = getServer({ params });
				const formData = await request.formData();
				const timestamp = Number(formData.get('timestamp'));
				console.log('ABORTING:', timestamp);
				try {
					await server.abort(timestamp);
				} catch (e) {
					return fail(400, { message: errorFrom(e).message });
				}
			},
		} satisfies Actions,
	} satisfies {
		load: Load;
		actions: Actions;
	};
}
