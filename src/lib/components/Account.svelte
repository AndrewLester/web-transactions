<script lang="ts">
import { enhance } from '$app/forms';
import { operation } from '$lib/form';
import type { Timestamp } from '$lib/timestamp';

export let timestamp: Timestamp;
export let account: { name: string; balance: number };
export let operationArgs: Parameters<typeof operation>;
export let skeleton = false;
</script>

<form
	action="?/deposit"
	method="POST"
	name="deposit"
	use:enhance={operation(...operationArgs)}
	class:skeleton
>
	<input type="hidden" name="timestamp" value={timestamp} />
	<p class="name">{account.name}</p>
	<p class="balance">${account.balance}</p>
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

<style>
form {
	padding: 5px 20px;
	--skeleton-color: var(--skeleton-color-light);
	background-color: var(--surface-light);
}

form:nth-child(even) {
	--skeleton-color: var(--skeleton-color-dark);
	background-color: var(--surface-dark);
}

.name {
	letter-spacing: 0.025em;
	opacity: 0.85;
	font-size: 0.9rem;
	margin-bottom: 2px;
	line-height: 1;
}

.balance {
	font-weight: bold;
	font-size: 1.75rem;
}

input {
	position: relative;
	margin-top: 20px;
}

.skeleton p {
	color: transparent;
	background: linear-gradient(105deg, transparent, var(--skeleton-color), transparent) repeat-x;
	background-size: 200% 100%;
	width: max-content;
	animation: skeleton 1s both infinite;
	user-select: none;
	border-radius: 3px;
}

@keyframes skeleton {
	from {
		background-position-x: 200%;
	}
	to {
		background-position-x: 0;
	}
}
</style>
