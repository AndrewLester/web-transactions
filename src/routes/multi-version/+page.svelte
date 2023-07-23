<script lang="ts">
import { enhance } from '$app/forms';
import { beforeNavigate, invalidateAll } from '$app/navigation';
import { timeout } from '$lib/timestamp.js';
import type { SubmitFunction } from '@sveltejs/kit';
import { onMount } from 'svelte';

export let data;

let timeoutStart = Date.now();
let timeoutCurrent = timeout;
let error: string | undefined;
let cancelForm: HTMLFormElement;

// Give them their time back after blocking ends, as is done in the backend
$: data.accounts.balances.then(() => (timeoutStart = Date.now()));
$: if (timeoutCurrent <= 0) {
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

function operation() {
	const actionReturnHandler: ReturnType<SubmitFunction> = async ({
		formElement,
		formData,
		result,
	}) => {
		timeoutStart = Date.now();
		if (result.type !== 'success') {
			if (result.type === 'failure') {
				error = (result.data as any).message;
			}
			cancelForm.requestSubmit();
			return;
		}
		const accountName = formData.get('account') as string;
		let accounts = await data.accounts.balances;
		let accountIdx = accounts.findIndex(({ name }) => name === accountName);
		if (accountIdx === -1) {
			accountIdx = accounts.length;
		}
		accounts[accountIdx] = {
			name: accountName,
			balance: Number(result.data),
		};
		data.accounts.balances = Promise.resolve(accounts);
		formElement.reset();
	};
	return actionReturnHandler;
}

function transaction() {
	const actionReturnHandler: ReturnType<SubmitFunction> = async ({ result }) => {
		timeoutStart = Date.now();
		if (result.type === 'failure') {
			error = (result.data as any).message;
		}
		invalidateAll();
	};
	return actionReturnHandler;
}
</script>

<h1>Multi-user ATM</h1>

{#if error}
	<p style="color: red;">{error}</p>
{/if}

<p>Timestamp: {data.timestamp}, Timeout: {timeoutCurrent}</p>

{#await data.accounts.balances}
	<p>Accounts are loading... someone else might be editing them.</p>
{:then balances}
	{#each balances as account (account.name)}
		<form action="?/deposit" method="POST" use:enhance={operation}>
			<input type="hidden" name="timestamp" value={data.timestamp} />
			<p>{account.name} - {account.balance}</p>
			<input type="hidden" name="account" value={account.name} />
			<label for="amount-{account.name}">Amount</label>
			<input
				type="number"
				id="amount-{account.name}"
				name="amount"
				required
				min="0"
				inputmode="numeric"
			/>
			<button>Deposit</button>
			<button formaction="?/withdraw">Withdraw</button>
		</form>
	{/each}
{/await}

<hr />

<form action="?/deposit" method="POST" use:enhance={operation}>
	<input type="hidden" name="timestamp" value={data.timestamp} />
	<label for="account">Account name</label>
	<input type="text" id="account" name="account" required maxlength="16" />
	<label for="amount">Deposit</label>
	<input type="number" id="amount" name="amount" required min="0" inputmode="numeric" />
	<button>Create</button>
</form>

<hr />

<form action="?/commit" method="POST" use:enhance={transaction}>
	<input type="hidden" name="timestamp" value={data.timestamp} />
	<button>Save changes</button>
</form>

<form action="?/abort" method="POST" bind:this={cancelForm} use:enhance={transaction}>
	<input type="hidden" name="timestamp" value={data.timestamp} />
	<button>Cancel</button>
</form>

<style>
label,
input {
	display: block;
}

input {
	margin-bottom: 25px;
}
</style>
