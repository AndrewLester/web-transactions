import type { Timestamp } from '$lib/timestamp';

export class Database {
	accounts = new Map<string, Account>();
}

export class Account {
	creators = new Set<Timestamp>(); // Transactions which created this account, for rollback handling
	deletors = new Set<Timestamp>();
	readTimestamps = new Set<Timestamp>();
	tentativeWrites = [] as TentativeWrite[];
	committedTimestamp = 0;
	committedBalance = 0;
	// lock    sync.Mutex Locking is not to worry about in this single threaded server
	name: string;
	balance: number; // The most important field

	constructor(name: string, balance: number) {
		this.name = name;
		this.balance = balance;
	}
}

export type TentativeWrite = {
	timestamp: Timestamp;
	tentativeBalance: number;
};
