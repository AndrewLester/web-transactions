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
