<script lang="ts">
	import { addFinish, finishes } from '$lib/stores';
	import { onDestroy } from 'svelte';

	// @ts-ignore
	let port: SerialPort | null = null;
	let reader: ReadableStreamDefaultReader<string> | null = null;
	let connected = false;
	let logs: string[] = [];

	function log(msg: string) {
		logs = [msg, ...logs];
	}

	async function connect() {
		if (!('serial' in navigator)) {
			alert('Web Serial unsupported. Use Chrome/Edge or consider WebUSB/WebHID/WS fallback.');
			return;
		}
		try {
			port = await (navigator as any).serial.requestPort({
				filters: [
					{ usbVendorId: 0x2341 } // Arduino (remove if your device is different)
				]
			});
			await port.open({ baudRate: 115200 });

			// 1) Wire serial bytes -> decoder
			const decoder = new TextDecoderStream();
			const readableStreamClosed = port.readable!.pipeTo(decoder.writable);

			// 2) Declare buffer before using it; build line splitter
			let buffer = '';
			const lineStream = decoder.readable.pipeThrough(
				new TransformStream<string, string>({
					transform(chunk, controller) {
						buffer += chunk;
						let idx;
						while ((idx = buffer.indexOf('\n')) !== -1) {
							const line = buffer.slice(0, idx).trim();
							buffer = buffer.slice(idx + 1);
							if (line) controller.enqueue(line);
						}
					}
				})
			);

			reader = lineStream.getReader();
			connected = true;
			log('Connected to finish gate');

			// Read loop
			(async () => {
				try {
					while (true) {
						const { value, done } = await reader.read();
						if (done) break;
						if (!value) continue;

						// 3) Use the decoded line (or just count an event)
						handlePassEvent(value);
					}
				} catch (e) {
					console.error(e);
					log(`Read error: ${String(e)}`);
				} finally {
					connected = false;
					log('Disconnected');
					// Close the piping cleanly
					try {
						await readableStreamClosed.catch(() => {});
					} catch {}
				}
			})();

			// Optional: listen for disconnect
			(navigator as any).serial.addEventListener('disconnect', (e: any) => {
				if (port && e.target === port) {
					connected = false;
					log('Gate unplugged');
				}
			});
		} catch (e) {
			console.error(e);
			alert(`Failed to connect: ${String(e)}`);
		}
	}

	function handlePassEvent(line?: string) {
		const time = Date.now();
		addFinish(time);
		// 4) Fix template string
		log(`Pass @ ${time}${line ? ` — ${line}` : ''}`);
	}

	async function disconnect() {
		try {
			await reader?.cancel();
			await port?.close();
		} catch {}
		reader = null;
		port = null;
		connected = false;
	}

	onDestroy(() => {
		disconnect();
	});
</script>

<div class="controls" style="display:flex; gap:.5rem;">
	<button on:click={connect} disabled={connected}>Connect gate</button>
</div>

<h3>Recent finishes</h3>
<ul>
	{#each $finishes.slice(0, 10) as f}
		<li>{f}</li>
	{/each}
</ul>

<h3>Log</h3>
<pre style="max-height: 16rem; overflow:auto;">{logs.join('\n')}</pre>
