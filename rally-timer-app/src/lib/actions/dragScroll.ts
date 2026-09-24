// Svelte action: drag a horizontally scrollable element with the mouse, with a
// short momentum glide on release (like a photo carousel). Touch and pen are
// left to the browser, which already scrolls natively with inertia.
//
// A drag only starts after the pointer moves DRAG_THRESHOLD px, so a plain
// click on a child still works; the click that ends a real drag is swallowed
// so dragging never selects whatever happened to be under the pointer.

const DRAG_THRESHOLD = 5; // px before a press becomes a drag
const FRICTION = 0.94; // velocity kept per 16 ms frame while gliding
const MIN_VELOCITY = 0.02; // px/ms at which the glide stops
const STALE_MS = 80; // a pause this long before release means "no fling"

export function dragScroll(node: HTMLElement): { destroy: () => void } {
	let pointerId: number | null = null;
	let dragging = false;
	let startX = 0;
	let startScroll = 0;
	let lastX = 0;
	let lastT = 0;
	let velocity = 0; // px/ms in scroll direction
	let raf = 0;

	function stopGlide(): void {
		cancelAnimationFrame(raf);
		raf = 0;
	}

	function glide(): void {
		let prev = performance.now();
		const frame = (now: number): void => {
			const dt = now - prev;
			prev = now;
			const before = node.scrollLeft;
			node.scrollLeft += velocity * dt;
			velocity *= Math.pow(FRICTION, dt / 16);
			const hitEdge = node.scrollLeft === before;
			if (Math.abs(velocity) < MIN_VELOCITY || hitEdge) return stopGlide();
			raf = requestAnimationFrame(frame);
		};
		raf = requestAnimationFrame(frame);
	}

	function swallowClick(e: MouseEvent): void {
		e.stopPropagation();
		e.preventDefault();
	}

	function onPointerDown(e: PointerEvent): void {
		if (e.pointerType !== 'mouse' || e.button !== 0) return;
		stopGlide();
		pointerId = e.pointerId;
		dragging = false;
		startX = lastX = e.clientX;
		lastT = e.timeStamp;
		startScroll = node.scrollLeft;
		velocity = 0;
	}

	function onPointerMove(e: PointerEvent): void {
		if (e.pointerId !== pointerId) return;
		const dx = e.clientX - startX;
		if (!dragging) {
			if (Math.abs(dx) < DRAG_THRESHOLD) return;
			dragging = true;
			node.setPointerCapture(e.pointerId);
			node.classList.add('is-dragging');
		}
		node.scrollLeft = startScroll - dx;
		const dt = e.timeStamp - lastT;
		if (dt > 0) velocity = (lastX - e.clientX) / dt;
		lastX = e.clientX;
		lastT = e.timeStamp;
	}

	function endDrag(e: PointerEvent, fling: boolean): void {
		if (e.pointerId !== pointerId) return;
		pointerId = null;
		if (!dragging) return;
		dragging = false;
		node.classList.remove('is-dragging');
		// The click (if any) is dispatched right after pointerup; drop it, then
		// stop listening so a later genuine click is not eaten.
		node.addEventListener('click', swallowClick, { capture: true });
		setTimeout(() => node.removeEventListener('click', swallowClick, { capture: true }), 0);
		if (fling && e.timeStamp - lastT < STALE_MS) glide();
	}

	const onPointerUp = (e: PointerEvent): void => endDrag(e, true);
	const onPointerCancel = (e: PointerEvent): void => endDrag(e, false);

	node.addEventListener('pointerdown', onPointerDown);
	node.addEventListener('pointermove', onPointerMove);
	node.addEventListener('pointerup', onPointerUp);
	node.addEventListener('pointercancel', onPointerCancel);
	node.addEventListener('wheel', stopGlide, { passive: true });

	return {
		destroy(): void {
			stopGlide();
			node.removeEventListener('pointerdown', onPointerDown);
			node.removeEventListener('pointermove', onPointerMove);
			node.removeEventListener('pointerup', onPointerUp);
			node.removeEventListener('pointercancel', onPointerCancel);
			node.removeEventListener('wheel', stopGlide);
		}
	};
}
