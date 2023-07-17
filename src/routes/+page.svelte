<script lang="ts">
import { enhance } from '$app/forms';
import { beforeNavigate } from '$app/navigation';
import type { SubmitFunction } from '@sveltejs/kit';

export let data;
export let form;

beforeNavigate(async ({ cancel, type }) => {
	if (type !== 'form') {
		document.cookie = 'abort=true; Secure';
		await fetch('?/abort', { method: 'POST', body: new FormData() });
	}
});

function operation() {
	const actionReturnHandler: ReturnType<SubmitFunction> = async ({
		formElement,
		formData,
		result,
		update,
	}) => {
		if (result.type !== 'success') {
			update({ reset: true });
			return;
		}
		const accountName = formData.get('account') as string;
		const accounts = await data.accounts.balances;
		data.accounts.balances = Promise.resolve([
			...accounts.filter(({ name }) => name !== accountName),
			{
				name: accountName,
				balance: Number(result.data),
			},
		]);
		formElement.reset();
	};
	return actionReturnHandler;
}
</script>

<h1>Multi-user ATM</h1>

{#if form?.message}
	<p style="color: red;">{form.message}</p>
{/if}

{#await data.accounts.balances}
	<p>Accounts are loading... someone else might be editing them.</p>
{:then balances}
	{#each balances as account (account.name)}
		<form action="?/deposit" method="POST" use:enhance={operation}>
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
	<label for="account">Account name</label>
	<input type="text" id="account" name="account" required maxlength="16" />
	<label for="amount">Deposit</label>
	<input type="number" id="amount" name="amount" required min="0" inputmode="numeric" />
	<button>Create</button>
</form>

<hr />

<form action="?/commit" method="POST" use:enhance>
	<button>Save changes</button>
</form>

<form action="?/abort" method="POST" use:enhance>
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
