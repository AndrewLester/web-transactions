<script lang="ts">
let frame1: HTMLIFrameElement;
let frame2: HTMLIFrameElement;
</script>

<div class="wrapper">
	<div class="atm-page">
		<div class="button-group">
			<a href="/timestamp-based/atm" target="_blank">
				Pop out <svg width="12" height="12" viewBox="0 0 12 12">
					<path
						fill="currentColor"
						d="M6 1h5v5L8.86 3.85 4.7 8 4 7.3l4.15-4.16L6 1ZM2 3h2v1H2v6h6V8h1v2a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"
					/>
				</svg>
			</a>
			<button on:click={() => frame1.contentWindow?.location.reload()}>↻</button>
		</div>
		<iframe src="/timestamp-based/atm" title="Atm 1" bind:this={frame1} />
	</div>
	<div class="atm-page">
		<div class="button-group">
			<a href="/timestamp-based/atm" target="_blank">
				Pop out <svg width="12" height="12" viewBox="0 0 12 12">
					<path
						fill="currentColor"
						d="M6 1h5v5L8.86 3.85 4.7 8 4 7.3l4.15-4.16L6 1ZM2 3h2v1H2v6h6V8h1v2a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"
					/>
				</svg>
			</a>
			<button on:click={() => frame2.contentWindow?.location.reload()}>↻</button>
		</div>
		<iframe src="/timestamp-based/atm" title="Atm 2" bind:this={frame2} />
	</div>
</div>

<style>
.wrapper {
	display: flex;
	flex-flow: row nowrap;
}
.atm-page {
	position: relative;
	flex: 1 1 0;
}
iframe {
	height: calc(100dvh - var(--nav-height));
	width: 100%;
	appearance: none;
	border: none;
}
.button-group {
	position: absolute;
	top: 5px;
	right: 5px;
}
a {
	border: 1px solid gray;
	background-color: rgb(166, 166, 166);
	color: inherit;
	text-decoration: none;
	padding-inline: 3px;
	border-radius: 2.5px;
}
</style>
