<script lang="ts">
import { applyAction, deserialize, enhance } from '$app/forms';
import { beforeNavigate, invalidateAll } from '$app/navigation';
import { page } from '$app/stores';
import Account from '$lib/components/Account.svelte';
import { operation, transaction, type OperationSuccessResult } from '$lib/form.js';
import type { Operation, Transaction } from '$lib/server.js';
import { timeout } from '$lib/timestamp.js';
import { onMount } from 'svelte';
import { flip } from 'svelte/animate';
import { fade, slide } from 'svelte/transition';

export let data;

let timeoutStart = Date.now();
let timeoutCurrent = timeout;
let error: string | undefined;
let cancelForm: HTMLFormElement;
let transactions = [] as Transaction[];
let autoRestart = true;

$: timestampBased = $page.params.ccType === 'timestamp-based';

// Give them their time back after blocking ends, as is done in the backend
$: data.accounts.balances.then(() => (timeoutStart = Date.now()));
$: if (timeoutCurrent <= 0) {
	finishTransaction({ type: 'abort' });
	// Grab a new timestamp once this one is timed out.
	invalidateAll();
	timeoutStart = Date.now();
}

onMount(() => {
	const interval = setInterval(
		() => (timeoutCurrent = timeout - Math.trunc((Date.now() - timeoutStart) / 1000)),
		1000
	);
	return () => clearInterval(interval);
});

beforeNavigate(({ type }) => {
	if (type !== 'form') {
		// Don't submit cancel form since this calls invalidateAll(), load will be called after refresh anyway
		fetch('?/abort', { method: 'POST', body: new FormData(cancelForm) });
	}
});

function addOperation(operation: Operation) {
	// Don't do this reactively to avoid layout shift
	data.operations.push(operation);
}

// Make sure you invalidate after this!
function finishTransaction(operation: Operation) {
	addOperation(operation);
	transactions = [{ timestamp: data.timestamp, operations: data.operations }, ...transactions];
	timeoutStart = Date.now();
}

async function success(action: URL, formData: FormData, result: OperationSuccessResult) {
	timeoutStart = Date.now();
	error = undefined;
	const accountName = formData.get('account') as string;
	let accounts = await data.accounts.balances;
	let accountIdx = accounts.findIndex(({ name }) => name === accountName);
	if (accountIdx === -1) {
		accountIdx = accounts.length;
	}
	accounts[accountIdx] = {
		name: accountName,
		balance: result.data!.balance,
	};
	data.operations = [
		...data.operations,
		// Know what form this is...
		{
			type: action.search.replace(/\?\//g, ''),
			account: accountName,
			value: Number(formData.get('amount')),
		},
		// We always balance right after making a change
		{
			type: 'balance',
			account: accountName,
		},
	];
	data.accounts.balances = Promise.resolve(accounts);
}

async function abort(e: string | undefined, formElement: HTMLFormElement, formData: FormData) {
	timeoutStart = Date.now();
	error = e;
	finishTransaction({ type: 'abort' });
	await invalidateAll();
	if (timestampBased && error === 'Timestamp outdated' && autoRestart) {
		error = undefined;
		// Slice off 2 because we do that by default too...
		const operations = transactions[0].operations.slice(2, -1);
		for (const operation of operations) {
			const formData = new FormData();
			formData.append('timestamp', data.timestamp.toString());
			// Must be an account for these type of operations
			formData.append('account', operation.account?.toString() ?? '');
			if (operation.value) {
				formData.append('amount', operation.value.toString());
			}
			const result = deserialize(
				await fetch(`?/${operation.type}`, { body: formData, method: 'POST' }).then((res) =>
					res.text()
				)
			);
			await applyAction(result);
		}

		formData.set('timestamp', data.timestamp.toString());
		const result = deserialize(
			await fetch(formElement.action, { body: formData, method: 'POST' }).then((res) => res.text())
		);
		await applyAction(result);
		const url = new URL(formElement.action);
		if (result.type === 'success') {
			success(url, formData, result as OperationSuccessResult);
		}
	}
}
</script>

<main>
	<article>
		<h1>Multi-user ATM</h1>

		<div class="accounts">
			{#await data.accounts.balances}
				<div out:fade={{ duration: 200 }}>
					{#each { length: data.numAccounts } as _}
						<Account
							account={{ name: 'Skeleton', balance: 100000 }}
							timestamp={0}
							operationArgs={{ success() {}, abort() {} }}
							skeleton
						/>
					{/each}
				</div>
			{:then balances}
				<div in:fade={{ duration: 200 }}>
					{#each balances as account (account.name)}
						<Account
							{account}
							timestamp={data.timestamp}
							operationArgs={{
								success,
								abort,
								start() {
									timeoutStart = Date.now();
								},
							}}
						/>
					{/each}
				</div>
			{/await}
		</div>

		<hr />

		<h2>New Account</h2>

		<form
			class="create-form"
			action="?/deposit"
			method="POST"
			name="deposit"
			use:enhance={operation({
				success,
				abort(e) {
					timeoutStart = Date.now();
					error = e;
					cancelForm.requestSubmit();
				},
				start() {
					timeoutStart = Date.now();
				},
			})}
		>
			<input type="hidden" name="timestamp" value={data.timestamp} />
			<label for="account">Account name</label>
			<input type="text" id="account" name="account" required maxlength="16" />
			<label for="amount">Deposit</label>
			<input type="number" id="amount" name="amount" required min="0" inputmode="numeric" />
			<button>Create</button>
		</form>

		<hr />

		<div class="button-group">
			<form
				action="?/commit"
				method="POST"
				name="commit"
				use:enhance={transaction({
					success() {
						finishTransaction({ type: 'commit' });
					},
					abort(e) {
						error = e;
					},
				})}
			>
				<input type="hidden" name="timestamp" value={data.timestamp} />
				<button>Save changes</button>
			</form>

			<form
				action="?/abort"
				method="POST"
				name="abort"
				bind:this={cancelForm}
				use:enhance={transaction({
					success() {
						finishTransaction({ type: 'abort' });
					},
					abort(e) {
						error = e;
					},
				})}
			>
				<input type="hidden" name="timestamp" value={data.timestamp} />
				<button>Cancel</button>
			</form>
		</div>
	</article>

	<aside>
		<h2>{data.timestamp} <abbr title="Operations">ops</abbr></h2>
		{#if error}
			<p style="color: red;">{error}</p>
		{/if}

		<p>Timeout: {timeoutCurrent}</p>
		{#if timestampBased}
			<label>
				<input type="checkbox" bind:checked={autoRestart} /> Autorestart
			</label>
		{/if}
		<hr />
		<ol class="operations">
			{#each data.operations as operation, i (i)}
				<li transition:slide={{ duration: 250 }}>
					<span class="operation-name">{operation.type.toUpperCase()}</span>
					{operation?.account ?? ''}
					{operation?.value ?? ''}
				</li>
			{/each}
		</ol>
		<hr />
		<div class="past-transactions">
			{#each transactions as transaction (transaction.timestamp)}
				<div transition:fade animate:flip={{ duration: 200 }}>
					<p>{transaction.timestamp}</p>
					{#each transaction.operations as operation}
						<li>
							<span class="operation-name">{operation.type.toUpperCase()}</span>
							{operation?.account ?? ''}
							{operation?.value ?? ''}
						</li>
					{/each}
				</div>
			{/each}
		</div>
	</aside>
</main>

<style>
main {
	display: grid;
	grid-template-columns: 1fr auto;
	grid-template-rows: 1fr;
	grid-template-areas: 'article aside';
}

article {
	grid-area: article;
}

aside {
	grid-area: aside;
	border-left: 1px solid var(--surface-light);
	margin-left: 5px;
	padding-inline: 5px;
	margin-top: 30px;
}

aside h2 {
	font-variant-numeric: tabular-nums;
}

label,
input:not([type='checkbox']) {
	display: block;
}

input:not([type='checkbox']) {
	margin-bottom: 25px;
}

hr {
	margin-block: 0.5em;
}

.accounts {
	display: grid;
	grid-template-rows: 1fr;
	grid-template-columns: 1fr;
}

.accounts > * {
	grid-area: 1/1;
}

.operations {
	list-style-type: none;
}

.operations li {
	font-family: 'Roboto Mono', monospace;
	font-size: 1.125rem;
}

.operation-name {
	font-weight: bold;
}

.past-transactions {
	font-size: 0.85rem;
	list-style-type: none;
}

.past-transactions > div {
	margin-top: 0.5em;
}

.button-group {
	display: flex;
	flex-flow: row nowrap;
	gap: 10px;
}
</style>
