<script lang="ts">
import '../app.css';
</script>

<nav>
	<a href="/timestamp-based">Timestamp-based</a>
	<a href="/multi-version">Multi-version</a>
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
	height: 65px;
	background-color: rgb(50, 49, 49);
}

nav a {
	color: white;
	text-decoration: none;
	text-transform: uppercase;
	letter-spacing: 0.1em;
	font-weight: bold;
}

nav a:hover {
	text-emphasis: '🔥';
}
</style>
