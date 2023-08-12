import { abortError, errorIs } from '$lib/error';
import type { Server } from '$lib/server';
import { timeout, type Timestamp } from '$lib/timestamp';
import { Database, Account, type TentativeWrite } from './database';

export const accountNotFound = abortError(() => new Error('Account not found'));
export const timestampOudated = abortError(() => new Error('Timestamp oudated'));
export const timestampInvalid = abortError(() => new Error('Timestamp invalid'));
export const accountNegativeBal = abortError(() => new Error('Account has a negative balance'));

export class TBCCServer implements Server {
	protected database = new Database();
	private config: ServerConfigEntry;
	// servers: map[string]*rpc.Client For multi server 2PC + DB sharding
	// transactions = new Map<number, Set<string>>(); Transaction ID to branches touched For multi server 2PC + DB sharding
	private timestamp: Timestamp = Date.now();
	private resolveTransactionEnd = () => {};
	private timeouts = new Map<Timestamp, number>();
	transactionEnd: Promise<void>;

	constructor(config: ServerConfigEntry) {
		this.config = config;
		this.transactionEnd = new Promise((resolve) => (this.resolveTransactionEnd = resolve));
	}

	startTransaction(): Timestamp {
		this.resetTimeout(++this.timestamp);
		return this.timestamp;
	}

	async deposit(timestamp: Timestamp, account: Account['name'], amount: number) {
		if (!this.isTimestampValid(timestamp)) {
			throw timestampInvalid(this, timestamp);
		}
		this.resetTimeout(timestamp);
		return await this.readThenUpdate(timestamp, account, amount);
	}

	async withdraw(timestamp: Timestamp, account: Account['name'], amount: number) {
		if (!this.isTimestampValid(timestamp)) {
			throw timestampInvalid(this, timestamp);
		}
		this.resetTimeout(timestamp);
		return await this.readThenUpdate(timestamp, account, -amount);
	}

	async balance(
		timestamp: Timestamp,
		accountName: Account['name'],
		abortNotFound = true
	): Promise<number> {
		if (!this.isTimestampValid(timestamp)) {
			throw timestampInvalid(this, timestamp);
		}

		this.resetTimeout(timestamp);

		if (!this.database.accounts.has(accountName)) {
			// Don't abort yet...
			if (abortNotFound) {
				throw accountNotFound(this, timestamp);
			} else {
				throw accountNotFound();
			}
		}

		const account = this.database.accounts.get(accountName)!;

		if (timestamp <= account.committedTimestamp) {
			throw timestampOudated(this, timestamp);
		}

		let maxViableWrite = {
			timestamp: account.committedTimestamp,
			tentativeBalance: account.committedBalance,
		} as TentativeWrite;

		for (const tentativeWrite of account.tentativeWrites) {
			if (
				tentativeWrite.timestamp > maxViableWrite.timestamp &&
				tentativeWrite.timestamp <= timestamp
			) {
				maxViableWrite = tentativeWrite;
			}
		}

		if (maxViableWrite.timestamp === account.committedTimestamp) {
			if (!account.committedTimestamp) {
				// Don't abort yet...
				throw accountNotFound();
			}

			account.readTimestamps.add(timestamp);
			return maxViableWrite.tentativeBalance;
		} else if (maxViableWrite.timestamp === timestamp) {
			return maxViableWrite.tentativeBalance;
		}

		await this.transactionEnd;

		return this.balance(timestamp, accountName);
	}

	allAccountNames(timestamp: Timestamp): string[] {
		// Only get accounts that are committed or we created
		return [...this.database.accounts.keys()].filter(this.visibleAccountsFilter(timestamp));
	}

	async allBalances(timestamp: Timestamp): Promise<{ name: string; balance: number }[]> {
		if (!this.isTimestampValid(timestamp)) {
			throw timestampInvalid(this, timestamp);
		}
		return await Promise.all(
			this.allAccountNames(timestamp).map(async (account) => ({
				name: account,
				balance: await this.balance(timestamp, account),
			}))
		);
	}

	async commit(timestamp: Timestamp) {
		if (!this.isTimestampValid(timestamp)) {
			throw timestampInvalid(this, timestamp);
		}

		for (const account of this.database.accounts.values()) {
			if (
				account.deletors.has(timestamp) &&
				account.tentativeWrites.every((tw) => tw.timestamp <= timestamp)
			) {
				account.committedBalance = 0;
				account.committedTimestamp = 0;
				this.database.accounts.delete(account.name);
				continue;
			}

			account.readTimestamps.delete(timestamp);

			for (let i = 0; i < account.tentativeWrites.length; i++) {
				const tentativeWrite = account.tentativeWrites[i];
				if (tentativeWrite.timestamp === timestamp) {
					if (tentativeWrite.tentativeBalance < 0) {
						throw accountNegativeBal(this, timestamp);
					}

					account.committedBalance = tentativeWrite.tentativeBalance;
					account.committedTimestamp = timestamp;
					account.tentativeWrites.splice(i, 1);
					break;
				}
			}
		}
		this.endTransaction();
	}

	async abort(timestamp: Timestamp) {
		if (!this.isTimestampValid(timestamp)) {
			throw timestampInvalid(this, timestamp);
		}

		for (const account of this.database.accounts.values()) {
			account.creators.delete(timestamp);
			if (account.creators.size === 0 && account.committedTimestamp === 0) {
				this.database.accounts.delete(account.name);
				continue;
			}

			account.readTimestamps.delete(timestamp);

			for (let i = 0; i < account.tentativeWrites.length; i++) {
				const tentativeWrite = account.tentativeWrites[i];
				if (timestamp == tentativeWrite.timestamp) {
					account.tentativeWrites.splice(i, 1);
					break;
				}
			}
		}
		this.endTransaction(timestamp);
		// Delete from transactions map
	}

	numAccounts(timestamp: Timestamp) {
		return this.allAccountNames(timestamp).length;
	}

	private endTransaction(timestamp?: Timestamp) {
		if (timestamp) {
			this.resetTimeout(timestamp, true);
		}
		this.resolveTransactionEnd();
		this.transactionEnd = new Promise((resolve) => (this.resolveTransactionEnd = resolve));
	}

	private resetTimeout(timestamp: Timestamp, cancel = false) {
		clearTimeout(this.timeouts.get(timestamp));

		if (cancel) {
			this.timeouts.delete(timestamp);
			return;
		}

		this.timeouts.set(
			timestamp,
			setTimeout(() => {
				// This might abort transactions twice, which only really has the effect of waking up
				// waiting transactions in incorrect contexts... we'll suffer this for now.
				// if (!this.isDone(timestamp)) {
				console.log('Aborting after timeout');
				this.abort(timestamp);
				// }
			}, 1000 * timeout)
		);
	}

	// This function is problematic...
	// private isDone(timestamp: Timestamp): boolean {
	// 	for (const account of this.database.accounts.values()) {
	// 		if (account.tentativeWrites.map((tw) => tw.timestamp).includes(timestamp)) {
	// 			return false;
	// 		}
	// 		if (account.readTimestamps.has(timestamp)) {
	// 			return false;
	// 		}
	// 	}
	// 	return true;
	// }

	private async readThenUpdate(timestamp: Timestamp, account: Account['name'], amount: number) {
		// Skip branches touched logic, for only 1 branch

		let balance = 0;
		try {
			balance = await this.balance(timestamp, account, false);
		} catch (e) {
			// Special case, account not found && amount >= 0 passes to create account
			if (!errorIs(e, accountNotFound()) || amount < 0) {
				// Now abort
				this.abort(timestamp);
				throw e;
			}
		}
		this.write(timestamp, account, balance + amount);
	}

	protected write(timestamp: Timestamp, accountName: Account['name'], amount: number) {
		if (!this.database.accounts.has(accountName)) {
			this.database.accounts.set(accountName, new Account(accountName, 0));
		}

		const account = this.database.accounts.get(accountName)!;

		let maxReadTimestamp = -1;
		for (const timestamp of account.readTimestamps) {
			if (timestamp > maxReadTimestamp) {
				maxReadTimestamp = timestamp;
			}
		}

		if (timestamp < maxReadTimestamp || timestamp <= account.committedTimestamp) {
			throw timestampOudated(this, timestamp);
		}

		for (const tentativeWrite of account.tentativeWrites) {
			if (tentativeWrite.timestamp === timestamp) {
				tentativeWrite.tentativeBalance = amount;
				if (amount === 0) {
					account.creators.delete(timestamp);
					account.deletors.add(timestamp);
					return;
				}

				if (account.committedTimestamp === 0) {
					account.creators.add(timestamp);
				}
				account.deletors.delete(timestamp);
				return;
			}
		}

		account.tentativeWrites.push({
			tentativeBalance: amount,
			timestamp: timestamp,
		});

		if (account.committedTimestamp === 0) {
			account.creators.add(timestamp);
		}

		if (amount === 0) {
			account.creators.delete(timestamp);
			account.deletors.add(timestamp);
		} else {
			account.deletors.delete(timestamp);
		}
	}

	private visibleAccountsFilter(timestamp: Timestamp) {
		return (accountName: string) => {
			const account = this.database.accounts.get(accountName)!;
			return account.committedTimestamp > 0 || account.creators.has(timestamp);
		};
	}

	private isTimestampValid(timestamp: Timestamp) {
		return timestamp <= this.timestamp;
	}
}

// Some parts of this are only useful for multi server
type ServerConfigEntry = {
	branch: string; // multi
	hostname: string; // multi
	port: string; // multi
};

export const server = new TBCCServer({
	branch: 'Branch 1',
	hostname: 'localhost',
	port: '8080',
});
