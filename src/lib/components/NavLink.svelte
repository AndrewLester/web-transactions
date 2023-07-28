<script lang="ts">
import { page } from '$app/stores';
import type { HTMLAnchorAttributes } from 'svelte/elements';

export let href: HTMLAnchorAttributes['href'] = undefined;

type $$Props = HTMLAnchorAttributes;

$: current = href && $page.url.pathname.includes(href);
</script>

<a {href} class:current>
	<slot />
</a>

<style>
a {
	color: white;
	text-decoration: none;
	text-transform: uppercase;
	letter-spacing: 0.1em;
	font-weight: bold;
}

a.current {
	text-decoration: overline;
	text-decoration-thickness: 3px;
}
</style>
