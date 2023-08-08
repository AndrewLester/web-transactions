<script lang="ts">
import { page } from '$app/stores';
import ATMWindows from '$lib/components/ATMWindows.svelte';
</script>

<ATMWindows path={$page.params.ccType} />
