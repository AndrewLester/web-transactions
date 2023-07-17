<script lang="ts">
import { enhance } from '$app/forms';
import { beforeNavigate, invalidateAll } from '$app/navigation';
import type { SubmitFunction } from '@sveltejs/kit';

export let data;

let error: string | undefined;

$: console.log(data.timestamp);

function operation() {
	const actionReturnHandler: ReturnType<SubmitFunction> = async ({
		formElement,
		formData,
		result,
	}) => {
		if (result.type !== 'success') {
			if (result.type === 'failure') {
				error = (result.data as any).message;
			}
			invalidateAll(); // Abort so re-read
			return;
		}
		const accountName = formData.get('account') as string;
		const accounts = await data.accounts.balances;
		accounts.splice(
			accounts.findIndex(({ name }) => name === accountName),
			1,
			{
				name: accountName,
				balance: Number(result.data),
			}
		);
		data.accounts.balances = Promise.resolve(accounts);
		formElement.reset();
	};
	return actionReturnHandler;
}

function transaction() {
	const actionReturnHandler: ReturnType<SubmitFunction> = async ({ result }) => {
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

<form action="?/abort" method="POST" use:enhance={transaction}>
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
