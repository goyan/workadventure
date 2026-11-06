<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import type { Snippet } from "svelte";

    interface Props {
        children: Snippet<[(event: PointerEvent) => void, (event: KeyboardEvent) => void]>;
        anchorTop?: number;
        onLayout?: (layout: { height: number; moved: boolean }) => void;
    }

    let { children, anchorTop = 0, onLayout }: Props = $props();
    let panel: HTMLDivElement | undefined = $state();
    let position: { left: number; top: number } | undefined = $state();
    let drag: { pointerId: number; x: number; y: number; left: number; top: number; handle: HTMLElement } | undefined;

    function parentOrigin(): { left: number; top: number } {
        const parent = panel?.offsetParent ?? panel?.parentElement;
        return parent?.getBoundingClientRect() ?? { left: 0, top: 0 };
    }

    function reportLayout(): void {
        onLayout?.({ height: panel?.offsetHeight ?? 0, moved: position !== undefined });
    }

    function moveTo(left: number, top: number): void {
        if (!panel) return;
        const origin = parentOrigin();
        const minLeft = -origin.left;
        const minTop = -origin.top;
        position = {
            left: Math.max(
                minLeft,
                Math.min(left, Math.max(minLeft, window.innerWidth - origin.left - panel.offsetWidth)),
            ),
            top: Math.max(
                minTop,
                Math.min(top, Math.max(minTop, window.innerHeight - origin.top - panel.offsetHeight)),
            ),
        };
        reportLayout();
    }

    function currentPosition(): { left: number; top: number } {
        const rect = panel?.getBoundingClientRect();
        const origin = parentOrigin();
        return position ?? { left: (rect?.left ?? 0) - origin.left, top: (rect?.top ?? 0) - origin.top };
    }

    function startDrag(event: PointerEvent): void {
        if (event.button !== 0 || event.isPrimary === false || drag || !(event.currentTarget instanceof HTMLElement)) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        const start = currentPosition();
        drag = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            ...start,
            handle: event.currentTarget,
        };
        event.currentTarget.setPointerCapture?.(event.pointerId);
    }

    function dragMove(event: PointerEvent): void {
        if (!drag || event.pointerId !== drag.pointerId) return;
        event.preventDefault();
        event.stopPropagation();
        moveTo(drag.left + event.clientX - drag.x, drag.top + event.clientY - drag.y);
    }

    function stopDrag(): void {
        const ended = drag;
        drag = undefined;
        if (ended?.handle.hasPointerCapture?.(ended.pointerId)) {
            ended.handle.releasePointerCapture(ended.pointerId);
        }
    }

    function endDrag(event: PointerEvent): void {
        if (drag?.pointerId !== event.pointerId) return;
        event.stopPropagation();
        stopDrag();
    }

    function moveWithKeyboard(event: KeyboardEvent): void {
        const step = 20;
        const left = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        const top = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
        if (!left && !top) return;
        event.preventDefault();
        event.stopPropagation();
        const start = currentPosition();
        moveTo(start.left + left, start.top + top);
    }

    function resize(): void {
        if (position) moveTo(position.left, position.top);
        reportLayout();
    }

    onMount(() => {
        reportLayout();
        if (!panel || typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(resize);
        observer.observe(panel);
        if (panel.parentElement) observer.observe(panel.parentElement);
        return () => observer.disconnect();
    });
    onDestroy(stopDrag);
</script>

<svelte:window
    onpointermove={dragMove}
    onpointerup={endDrag}
    onpointercancel={endDrag}
    onlostpointercapture={endDrag}
    onblur={stopDrag}
    onresize={resize}
/>

<div
    bind:this={panel}
    class="absolute right-2 z-[300] flex flex-col gap-2 items-end"
    style:left={position ? `${position.left}px` : undefined}
    style:top={`${position?.top ?? anchorTop}px`}
    style:right={position ? "auto" : undefined}
    data-testid="draggable-jam-panel"
>
    {@render children(startDrag, moveWithKeyboard)}
</div>
