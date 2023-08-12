import { abortError, errorIs } from '$lib/error';
import type { Server } from '$lib/server';
import type { Timestamp } from '$lib/timestamp';
import { Account, Database } from './database';

export const accountNotFound = abortError(() => new Error('Account not found'));
export const timestampOudated = abortError(() => new Error('Timestamp oudated'));
export const accountNegativeBal = abortError(() => new Error('Account has a negative balance'));

export class MVCCServer implements Server {
	private database = new Database();
	private config: ServerConfigEntry;
	// servers: map[string]*rpc.Client For multi server 2PC + DB sharding
	// transactions = new Map<number, Set<string>>(); Transaction ID to branches touched For multi server 2PC + DB sharding
	private timestamp: Timestamp = Date.now();
	private resolveTransactionEnd = () => {};
	transactionEnd: Promise<void>;

	constructor(config: ServerConfigEntry) {
		this.config = config;
		this.transactionEnd = new Promise((resolve) => (this.resolveTransactionEnd = resolve));
	}

	startTransaction(): Timestamp {
		const timestamp = this.timestamp++;
		setTimeout(() => {
			if (!this.done(timestamp)) {
				this.abort(timestamp);
			}
		}, 1000 * 30);
		return timestamp;
	}

	done(timestamp: Timestamp): boolean {
		// for (const account of this.database.accounts.values()) {
		// 	if (account.tentativeWrites.map((tw) => tw.timestamp).includes(timestamp)) {
		// 		return false;
		// 	}
		// }
		return true;
	}

	endTransaction() {
		this.resolveTransactionEnd();
		this.transactionEnd = new Promise((resolve) => (this.resolveTransactionEnd = resolve));
	}

	async deposit(timestamp: Timestamp, account: Account['name'], amount: number) {
		return await this.readThenUpdate(timestamp, account, amount);
	}

	async withdraw(timestamp: Timestamp, account: Account['name'], amount: number) {
		return await this.readThenUpdate(timestamp, account, -amount);
	}

	async balance(timestamp: Timestamp, accountName: Account['name']): Promise<number> {
		const account = this.database.getAccount(timestamp, accountName);
		if (!account || account.deleted) {
			throw accountNotFound(this, timestamp);
		}

		account.readTimestamp = timestamp;

		return account.balance;
	}

	allAccountNames(timestamp: number): string[] {
		// TODO: Filter this by accessible to current user...
		return [...this.database.snapshots.keys()];
	}

	async allBalances(timestamp: Timestamp): Promise<{ name: string; balance: number }[]> {
		// TODO: Filter this by accessible to current user...
		return await Promise.all(
			[...this.database.snapshots.keys()].map(async (account) => ({
				name: account,
				balance: await this.balance(timestamp, account),
			}))
		);
	}

	async commit(timestamp: Timestamp) {}

	async abort(timestamp: Timestamp) {
		timestamp;
		// Do nothing, clean up snapshots later
	}

	numAccounts(timestamp: Timestamp): number {
		// TODO: this doesn't work
		return this.database.snapshots.size;
	}

	private async readThenUpdate(timestamp: Timestamp, account: Account['name'], amount: number) {
		// Skip branches touched logic, for only 1 branch

		let balance = 0;
		try {
			balance = await this.balance(timestamp, account);
		} catch (e) {
			// Special case, account not found && amount >= 0 passes to create account
			if (!errorIs(e, accountNotFound()) || amount < 0) {
				throw e;
			}
		}
		this.write(timestamp, account, balance + amount);
	}

	private write(timestamp: Timestamp, accountName: Account['name'], amount: number) {
		if (!this.database.snapshots.has(accountName)) {
			this.database.snapshots.set(accountName, [new Account(accountName, 0)]);
		}

		const account = this.database.getAccount(timestamp, accountName)!;

		if (account.readTimestamp > timestamp) {
			throw timestampOudated(this, timestamp);
		}

		const newAccount = account.newVersion(timestamp, timestamp);
		newAccount.balance += amount;
		this.database.snapshots.get(accountName)?.push(newAccount);
	}
}

// Some parts of this are only useful for multi server
type ServerConfigEntry = {
	branch: string; // multi
	hostname: string; // multi
	port: string; // multi
};

export const server = new MVCCServer({
	branch: 'Branch 1',
	hostname: 'localhost',
	port: '8080',
});
