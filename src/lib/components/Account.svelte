<script lang="ts">
import { enhance } from '$app/forms';
import { operation } from '$lib/form';
import type { Timestamp } from '$lib/timestamp';
import { fade } from 'svelte/transition';

export let timestamp: Timestamp;
export let account: { name: string; balance: number };
export let operationArgs: Parameters<typeof operation>[0];
export let skeleton = false;

let loading = false;

function loadingWrap(func?: (...args: any) => void) {
	return (...args: any) => {
		loading = false;
		func?.(...args);
	};
}
</script>

<form
	action="?/deposit"
	method="POST"
	name="deposit"
	use:enhance={operation({
		success: loadingWrap(operationArgs.success),
		abort: loadingWrap(operationArgs.abort),
		start: () => {
			loading = true;
			operationArgs.start?.();
		},
	})}
	class:skeleton
	class:loading
>
	<input type="hidden" name="timestamp" value={timestamp} />
	<p class="name">
		{account.name}
		{#if account.balance === 0}
			<span class="account-message">(Will be deleted)</span>
		{/if}
	</p>
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
	<button disabled={loading}>Deposit</button>
	<button formaction="?/withdraw" disabled={loading}>Withdraw</button>
	{#if loading}
		<svg
			width="15"
			height="15"
			viewBox="0 0 100 100"
			stroke-dasharray="76 188"
			stroke-dashoffset="152"
		>
			<circle cx="50" cy="50" r="42" stroke-width="16" stroke="#2196f3" fill="transparent" />
		</svg>
	{/if}
</form>

<style>
form {
	position: relative;
	padding: 5px 20px;
	--skeleton-color: var(--skeleton-color-light);
	background-color: var(--surface-light);
	transition: opacity 250ms ease;
}

form:nth-child(even) {
	--skeleton-color: var(--skeleton-color-dark);
	background-color: var(--surface-dark);
}

form.loading {
	opacity: 0.75;
}

svg {
	position: absolute;
	right: 10px;
	top: 10px;
	display: block;
	animation: spin 500ms linear infinite both;
}

.name {
	letter-spacing: 0.025em;
	opacity: 0.85;
	font-size: 0.9rem;
	margin-bottom: 2px;
	line-height: 1;
}

.account-message {
	font-style: italic;
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

@keyframes spin {
	from {
		transform: rotate(0deg);
	}
	to {
		transform: rotate(360deg);
	}
}
</style>
