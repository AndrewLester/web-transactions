export class RWLock<ID> {
	readLocked = new Set<ID>();
	writeLocked: ID | null = null;
	writeUnlockedPromises = new Map<
		ID,
		{ promise?: Promise<unknown>; resolve?: (value: unknown) => void }
	>();
	readUnlockedPromises = new Map<
		ID,
		{ promise?: Promise<unknown>; resolve?: (value: unknown) => void }
	>();

	async rLock(id: ID) {
		if (this.readLocked.has(id)) {
			return;
		}

		if (this.writeLocked === id) {
			// Doesn't support downgrading, sorry! Unlock, then re-acquire.
			return;
		}

		await this.writeUnlockedPromise(id);

		this.readLocked.add(id);
		this.writeUnlockedPromises.delete(id);
	}

	async wLock(id: ID) {
		if (this.writeLocked === id) {
			return;
		}

		const lockWaits = [this.writeUnlockedPromise(id), this.readUnlockedPromise(id)];

		// Drop our read lock if we have it
		if (this.readLocked.has(id)) {
			this.readLocked.delete(id);
			if (this.readLocked.size === 0) {
				this.readUnlocked();
			}
		}

		await Promise.all(lockWaits);

		this.writeLocked = id;
		this.writeUnlockedPromises.delete(id);
		this.readUnlockedPromises.delete(id);
	}

	getWaitFor(id: ID, mode: 'read' | 'write') {
		const waitFor = [] as ID[];

		if (this.writeLocked === id) {
			return waitFor;
		}

		if (this.writeLocked !== null) {
			waitFor.push(this.writeLocked);
		}

		const otherReaders = [...this.readLocked.keys()].filter((otherId) => otherId !== id);
		if (mode === 'write' && otherReaders.length > 0) {
			waitFor.push(...otherReaders);
		}

		return waitFor;
	}

	hasLock(id: ID, type?: 'read' | 'write') {
		const hasRead = this.readLocked.has(id);
		const hasWrite = this.writeLocked === id;
		if (!type) {
			return hasRead || hasWrite;
		}
		if (type === 'read') {
			return hasRead;
		}
		return hasWrite;
	}

	unlock(id: ID) {
		if (this.writeLocked !== id && !this.readLocked.has(id)) {
			throw new Error('Attempted to unlock un-owned lock');
		}

		if (this.writeLocked === id) {
			this.writeLocked = null;
			this.writeUnlocked();
			return;
		}

		this.readLocked.delete(id);
		if (this.readLocked.size === 0) {
			this.readUnlocked();
		}
	}

	private writeUnlockedPromise(id: ID) {
		if (this.writeUnlockedPromises.size === 0 && this.writeLocked === null) {
			this.writeUnlockedPromises.set(id, { promise: Promise.resolve(), resolve: () => {} });
			return Promise.resolve();
		}

		if (!this.writeUnlockedPromises.has(id)) {
			const promise = new Promise((resolve) => {
				this.writeUnlockedPromises.set(id, { ...this.writeUnlockedPromises.get(id), resolve });
			});
			this.writeUnlockedPromises.set(id, { ...this.writeUnlockedPromises.get(id), promise });
		}
		return this.writeUnlockedPromises.get(id)!.promise!;
	}

	private readUnlockedPromise(id: ID) {
		if (this.readLocked.size === 0) {
			this.readUnlockedPromises.set(id, { promise: Promise.resolve(), resolve: () => {} });
			return Promise.resolve();
		}

		if (!this.readUnlockedPromises.has(id)) {
			const promise = new Promise((resolve) => {
				this.readUnlockedPromises.set(id, { ...this.readUnlockedPromises.get(id), resolve });
			});
			this.readUnlockedPromises.set(id, { ...this.readUnlockedPromises.get(id), promise });
		}
		return this.readUnlockedPromises.get(id)!.promise!;
	}

	private writeUnlocked() {
		const potentialUnlocks = [...this.writeUnlockedPromises.keys()] as ID[];
		const chosenUnlock = potentialUnlocks[Math.trunc(potentialUnlocks.length * Math.random())];
		this.writeUnlockedPromises.get(chosenUnlock)?.resolve?.(null);
		this.writeUnlockedPromises.delete(chosenUnlock);
	}

	private readUnlocked() {
		const potentialUnlocks = [...this.readUnlockedPromises.keys()] as ID[];
		const chosenUnlock = potentialUnlocks[Math.trunc(potentialUnlocks.length * Math.random())];
		this.readUnlockedPromises.get(chosenUnlock)?.resolve?.(null);
		this.readUnlockedPromises.delete(chosenUnlock);
	}
}
