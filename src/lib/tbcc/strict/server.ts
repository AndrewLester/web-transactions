import { abortError } from '$lib/error';
import type { Timestamp } from '$lib/timestamp';
import { Account } from '../database';
import { TBCCServer, timestampOudated } from '../server';

export const accountDirty = abortError(() => new Error('Account is dirty'));

class TBCCStrictServer extends TBCCServer {
	protected write(timestamp: Timestamp, accountName: Account['name'], amount: number) {
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
			} else {
				// DIRTY, quit to protect strictness
				throw accountDirty(this, timestamp);
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

export const server = new TBCCStrictServer({
	branch: 'Branch 1',
	hostname: 'localhost',
	port: '8080',
});
