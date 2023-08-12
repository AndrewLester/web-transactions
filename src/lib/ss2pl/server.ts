import { abortError, errorIs } from '$lib/error';
import type { Server } from '$lib/server';
import { timeout, type Timestamp } from '$lib/timestamp';
import { Database, Account } from './database';

export const accountNotFound = abortError(() => new Error('Account not found'));
export const accountNegativeBal = abortError(() => new Error('Account has a negative balance'));
export const timestampInvalid = abortError(() => new Error('Timestamp invalid'));
export const deadlockDetected = abortError(() => new Error('Deadlock detected'));

export class SS2PLServer implements Server {
	protected database = new Database();
	private config: ServerConfigEntry;
	// servers: map[string]*rpc.Client For multi server 2PC + DB sharding
	// transactions = new Map<number, Set<string>>(); Transaction ID to branches touched For multi server 2PC + DB sharding
	private timestamp: Timestamp = Date.now();
	private timeouts = new Map<Timestamp, number>();
	private waitForGraph = new Map<Timestamp, Set<Timestamp>>();

	constructor(config: ServerConfigEntry) {
		this.config = config;
	}

	startTransaction(): Timestamp {
		const timestamp = this.timestamp++;
		this.database.setupWorkspace(timestamp);
		this.resetTimeout(timestamp);
		return timestamp;
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

	async balance(timestamp: Timestamp, accountName: Account['name'], abortNotFound = true) {
		if (!this.isTimestampValid(timestamp)) {
			throw timestampInvalid(this, timestamp);
		}

		this.resetTimeout(timestamp);

		if (!this.database.hasAccount(timestamp, accountName)) {
			// Don't abort yet...
			if (abortNotFound) {
				throw accountNotFound(this, timestamp);
			} else {
				throw accountNotFound();
			}
		}

		const lock = this.database.getLock(timestamp, accountName, 'read');

		const waitFor = lock.getWaitFor(timestamp, 'read');

		for (const other of waitFor) {
			if (!this.waitForGraph.has(timestamp)) {
				this.waitForGraph.set(timestamp, new Set());
			}
			this.waitForGraph.get(timestamp)!.add(other);
		}

		if (this.hasWaitForCycle(timestamp)) {
			throw deadlockDetected(this, timestamp);
		}

		await lock.rLock(timestamp);

		// We aborted...
		if (!this.database.hasWorkspace(timestamp)) {
			throw timestampInvalid(this, timestamp);
		}

		this.resetTimeout(timestamp);

		return await this.database.getBalance(timestamp, accountName);
	}

	allAccountNames(timestamp: Timestamp): string[] {
		return [...this.database.getAccountNames(timestamp)];
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

		for (const { balance, lock } of this.database.getBalancesAndLocks()) {
			if (lock.hasLock(timestamp, 'write')) {
				if (balance < 0) {
					throw accountNegativeBal(this, timestamp);
				}
			}
		}

		this.database.commitWorkspace(timestamp);

		this.endTransaction(timestamp);
	}

	async abort(timestamp: Timestamp) {
		if (!this.isTimestampValid(timestamp)) {
			// Don't abort again...
			throw timestampInvalid();
		}

		this.endTransaction(timestamp);
	}

	numAccounts(timestamp: Timestamp) {
		return this.allAccountNames(timestamp).length;
	}

	private endTransaction(timestamp: Timestamp) {
		this.resetTimeout(timestamp, true);

		for (const { lock } of this.database.getBalancesAndLocks()) {
			if (lock.hasLock(timestamp)) {
				lock.unlock(timestamp);
			} else if (lock.isWaiting(timestamp)) {
				lock.stopWaiting(timestamp);
			}
		}

		const deletedTimestamps = [] as Timestamp[];
		for (const [fromTimestamp, waitFor] of this.waitForGraph.entries()) {
			waitFor.delete(timestamp);
			if (waitFor.size === 0) {
				deletedTimestamps.push(fromTimestamp);
			}
		}
		deletedTimestamps.forEach((timestamp) => this.waitForGraph.delete(timestamp));

		this.database.destroyWorkspace(timestamp);
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
				if (this.database.hasWorkspace(timestamp)) {
					this.abort(timestamp);
				}
			}, 1000 * timeout)
		);
	}

	// PROBLEMATIC see TBCC
	// private isDone(timestamp: Timestamp): boolean {
	// 	for (const account of this.database.accounts.values()) {
	// 		if (account.tentativeWrites.map((tw) => tw.timestamp).includes(timestamp)) {
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
		await this.write(timestamp, account, balance + amount);
	}

	protected async write(timestamp: Timestamp, accountName: Account['name'], amount: number) {
		const lock = this.database.getLock(timestamp, accountName, 'write');

		const waitFor = lock.getWaitFor(timestamp, 'write');
		for (const other of waitFor) {
			if (!this.waitForGraph.has(timestamp)) {
				this.waitForGraph.set(timestamp, new Set());
			}
			this.waitForGraph.get(timestamp)!.add(other);
		}

		if (this.hasWaitForCycle(timestamp)) {
			throw deadlockDetected(this, timestamp);
		}

		await lock.wLock(timestamp);

		// We aborted...
		if (!this.database.hasWorkspace(timestamp)) {
			throw timestampInvalid(this, timestamp);
		}

		this.resetTimeout(timestamp);

		this.database.setBalance(timestamp, accountName, amount);
	}

	private hasWaitForCycle(timestamp: Timestamp) {
		if (this.waitForGraph.size === 0) {
			return false;
		}

		const visited = new Set<Timestamp>([]);
		return isCyclic(timestamp, this.waitForGraph, visited);
	}

	private isTimestampValid(timestamp: Timestamp) {
		return timestamp <= this.timestamp;
	}
}

function isCyclic<Node>(node: Node, graph: Map<Node, Set<Node>>, visited: Set<Node>) {
	if (visited.has(node)) {
		return true;
	}

	visited.add(node);
	const neighbors = graph.get(node) ?? new Set([]);
	for (const neighbor of neighbors) {
		if (isCyclic(neighbor, graph, visited)) {
			return true;
		}
	}

	return false;
}

// Some parts of this are only useful for multi server
type ServerConfigEntry = {
	branch: string; // multi
	hostname: string; // multi
	port: string; // multi
};

export const server = new SS2PLServer({
	branch: 'Branch 1',
	hostname: 'localhost',
	port: '8080',
});
