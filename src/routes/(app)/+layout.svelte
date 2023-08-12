<script lang="ts">
import NavLink from '$lib/components/NavLink.svelte';
</script>

<nav>
	<NavLink href="/timestamp-based">
		Timestamp-based (<abbr title="Avoids Cascading Aborts">ACA</abbr>)
	</NavLink>
	<NavLink href="/strong-strict-2pl">
		<abbr title="Strong Strict Two-Phase Locking">SS2PL</abbr> (<abbr
			title="Avoids Cascading Aborts">ACA</abbr
		>)
	</NavLink>
</nav>

<slot />

<style>
nav {
	display: flex;
	flex-flow: row nowrap;
	align-items: center;
	justify-content: center;
	gap: 20px;
	width: 100%;
	height: var(--nav-height);
	background-color: rgb(50, 49, 49);
}
</style>
