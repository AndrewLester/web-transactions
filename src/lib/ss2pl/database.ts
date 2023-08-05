import { RWLock } from '$lib/lock';
import type { Timestamp } from '$lib/timestamp';

export class Database {
	accounts = new Map<string, Account>();
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
