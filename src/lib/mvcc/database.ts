import type { Timestamp } from '$lib/timestamp';

export class Database {
	snapshots = new Map<string, Account[]>();

	getAccount(timestamp: Timestamp, accountName: string): Account | null {
		const snapshots = this.snapshots.get(accountName);
		if (!snapshots) {
			return null;
		}

		let highestPossibleWTSSnapshot = snapshots[0];
		for (const snapshot of snapshots) {
			if (
				snapshot.writeTimestamp > highestPossibleWTSSnapshot.writeTimestamp &&
				snapshot.writeTimestamp < timestamp
			) {
				highestPossibleWTSSnapshot = snapshot;
			}
		}

		return highestPossibleWTSSnapshot;
	}
}

export class Account {
	balance: number;
	name: string;

	readTimestamp = 0 as Timestamp;
	writeTimestamp = 0 as Timestamp;

	deleted = false;

	constructor(name: string, balance: number) {
		this.name = name;
		this.balance = balance;
	}

	newVersion(readTimestamp: Timestamp, writeTimestamp: Timestamp): Account {
		const newAccount = structuredClone(this);
		newAccount.readTimestamp = readTimestamp;
		newAccount.writeTimestamp = writeTimestamp;
		return newAccount;
	}
}
