import { RWLock } from '$lib/lock';
import type { Timestamp } from '$lib/timestamp';

export class Database {
	private accounts = new Map<Account['name'], Account>();
	private workspaces = new Map<
		Timestamp,
		Map<Account['name'], { account: Account; written: boolean }>
	>();

	getAccountNames(timestamp: Timestamp) {
		return new Set([...this.accounts.keys(), ...(this.workspaces.get(timestamp)?.keys() ?? [])]);
	}

	hasWorkspace(timestamp: Timestamp) {
		return this.workspaces.has(timestamp);
	}

	// Workspaces must exist before running these...
	hasAccount(timestamp: Timestamp, accountName: Account['name']) {
		return this.workspaces.get(timestamp)?.has(accountName) || this.accounts.has(accountName);
	}

	async getBalance(timestamp: Timestamp, accountName: Account['name']) {
		if (!this.workspaces.get(timestamp)!.has(accountName)) {
			if (!this.accounts.has(accountName)) {
				throw new Error('Account does not exist');
			}

			this.workspaces.get(timestamp)!.set(accountName, {
				account: { ...this.accounts.get(accountName)! },
				written: false,
			});
		}

		return this.workspaces.get(timestamp)!.get(accountName)!.account.balance;
	}

	async setBalance(timestamp: Timestamp, accountName: Account['name'], balance: number) {
		if (!this.workspaces.get(timestamp)!.has(accountName)) {
			let account = this.accounts.get(accountName);
			if (!account) {
				account = new Account(accountName, 0);
			}

			this.workspaces.get(timestamp)!.set(accountName, {
				// Copy the account!
				account: { ...account },
				written: true,
			});
		}

		const workspace = this.workspaces.get(timestamp)!.get(accountName)!;
		workspace.account.balance = balance;
		workspace.written = true;
	}

	getLock(timestamp: Timestamp, accountName: Account['name'], type: 'read' | 'write') {
		let account = this.workspaces.get(timestamp)?.get(accountName)?.account;
		if (!account) {
			account = this.accounts.get(accountName);
		}

		if (!account) {
			if (type === 'read') {
				throw new Error('Account does not exist');
			}

			account = new Account(accountName, 0);

			// This is technically incorrect behavior... be CAREFUL, we should not have this balance in the workspace at this time
			// The reason we have to do this here is that we need the lock instance set up
			this.workspaces.get(timestamp)!.set(accountName, {
				account: { ...account },
				written: false, // Not actually written yet though
			});
		}

		return account.lock;
	}

	// Had to make this general and get locks for all accounts... Probably not? ideal,
	// but necessary because we might be waiting for a lock (need to stop waiting), but never actually read
	// so account is not in workspace
	getBalancesAndLocks() {
		return [...(this.accounts.values() ?? [])].map((account) => ({
			balance: account.balance,
			lock: account.lock,
		}));
	}

	setupWorkspace(timestamp: Timestamp) {
		this.workspaces.set(timestamp, new Map());
	}

	commitWorkspace(timestamp: Timestamp) {
		for (const { account, written } of this.workspaces.get(timestamp)!.values()) {
			if (written) {
				if (!this.accounts.has(account.name) && account.balance > 0) {
					this.accounts.set(account.name, account);
				} else if (this.accounts.has(account.name)) {
					// Must exist in accounts since we had write lock...
					this.accounts.get(account.name)!.balance = account.balance;
				}
			}
		}
	}

	destroyWorkspace(timestamp: Timestamp) {
		for (const { account, written } of this.workspaces.get(timestamp)!.values()) {
			if (written && account.balance === 0) {
				this.accounts.delete(account.name);
			}
		}
		this.workspaces.delete(timestamp);
	}
}

export class Account {
	creators = new Set<Timestamp>(); // Transactions which created this account, for rollback handling
	lock = new RWLock<Timestamp>();
	name: string;
	balance: number; // The most important field

	constructor(name: string, balance: number) {
		this.name = name;
		this.balance = balance;
	}
}
