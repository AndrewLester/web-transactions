import { Database, Account, type Timestamp, type TentativeWrite } from './database';
import { abortError, errorIs } from './error';

export const accountNotFound = abortError(() => new Error('Account not found'));
export const timestampOudated = abortError(() => new Error('Timestamp oudated'));
export const accountNegativeBal = abortError(() => new Error('Account has a negative balance'));

export class Server {
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
		for (const account of this.database.accounts.values()) {
			if (account.tentativeWrites.map((tw) => tw.timestamp).includes(timestamp)) {
				return false;
			}
		}
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
		if (!this.database.accounts.has(accountName)) {
			throw accountNotFound(this, timestamp);
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
				throw accountNotFound(this, timestamp);
			}

			account.readTimestamps.add(timestamp);
			return maxViableWrite.tentativeBalance;
		} else if (maxViableWrite.timestamp === timestamp) {
			return maxViableWrite.tentativeBalance;
		}

		await this.transactionEnd;

		return this.balance(timestamp, accountName);
	}

	async allBalances(timestamp: Timestamp): Promise<{ name: string; balance: number }[]> {
		return await Promise.all(
			[...this.database.accounts.keys()].map(async (account) => ({
				name: account,
				balance: await this.balance(timestamp, account),
			}))
		);
	}

	async commit(timestamp: Timestamp) {
		for (const account of this.database.accounts.values()) {
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
		this.endTransaction();
		// Delete from transactions map
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
		console.log(`WRITE ${timestamp}: ${accountName} = ${amount}`);

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
	}
}

// Some parts of this are only useful for multi server
type ServerConfigEntry = {
	branch: string; // multi
	hostname: string; // multi
	port: string; // multi
};

export const server = new Server({
	branch: 'Branch 1',
	hostname: 'localhost',
	port: '8080',
});
