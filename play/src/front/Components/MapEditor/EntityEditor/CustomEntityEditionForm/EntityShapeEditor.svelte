<script lang="ts">
    import type { CollisionRectangle } from "@workadventure/map-editor";
    import { moveRectangle, resizeRectangle, type ResizeHandle } from "./EntityShapeGeometry";

    // The image enlarged at a whole zoom (sharp pixels) with its hitbox (red) and water (blue) on top. The active shape
    // is dragged to move it and by its handles to resize it, pixel by pixel of the image; arrow keys move it by one
    // pixel, Shift + arrows resize it. Images often have stray pixels, so the generated shapes are only a start.
    interface Props {
        imageSource: string;
        frameWidth: number;
        frameHeight: number;
        /** Frames of an animated strip: only the first one is shown. */
        frameCount?: number;
        hitbox: CollisionRectangle | undefined;
        water: CollisionRectangle | undefined;
        active: "hitbox" | "water";
        onHitboxChange: (rectangle: CollisionRectangle) => void;
        onWaterChange: (rectangle: CollisionRectangle) => void;
    }

    let {
        imageSource,
        frameWidth,
        frameHeight,
        frameCount = 1,
        hitbox,
        water,
        active,
        onHitboxChange,
        onWaterChange,
    }: Props = $props();

    const MAX_DISPLAY = 288;
    const zoom = $derived(
        frameWidth > 0 && frameHeight > 0
            ? Math.max(1, Math.floor(Math.min(MAX_DISPLAY / frameWidth, MAX_DISPLAY / frameHeight)))
            : 1,
    );
    const HANDLES: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

    let drag:
        | {
              pointerId: number;
              startX: number;
              startY: number;
              start: CollisionRectangle;
              handle: ResizeHandle | "move";
          }
        | undefined;

    function activeShape(): CollisionRectangle | undefined {
        return active === "hitbox" ? hitbox : water;
    }

    function commit(rectangle: CollisionRectangle) {
        if (active === "hitbox") onHitboxChange(rectangle);
        else onWaterChange(rectangle);
    }

    function startDrag(event: PointerEvent, handle: ResizeHandle | "move") {
        const start = activeShape();
        if (!start || event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, start, handle };
    }

    function onPointerMove(event: PointerEvent) {
        if (!drag || event.pointerId !== drag.pointerId) return;
        const dx = Math.round((event.clientX - drag.startX) / zoom);
        const dy = Math.round((event.clientY - drag.startY) / zoom);
        const bounds = { width: frameWidth, height: frameHeight };
        commit(
            drag.handle === "move"
                ? moveRectangle(drag.start, dx, dy, bounds)
                : resizeRectangle(drag.start, drag.handle, dx, dy, bounds),
        );
    }

    function endDrag(event: PointerEvent) {
        if (drag?.pointerId === event.pointerId) drag = undefined;
    }

    function onKeyDown(event: KeyboardEvent) {
        const shape = activeShape();
        if (!shape) return;
        const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
        if (!step) return;
        event.preventDefault();
        const bounds = { width: frameWidth, height: frameHeight };
        commit(
            event.shiftKey
                ? resizeRectangle(shape, "se", step[0], step[1], bounds)
                : moveRectangle(shape, step[0], step[1], bounds),
        );
    }

    function boxStyle(rectangle: CollisionRectangle): string {
        return `left:${rectangle.x * zoom}px;top:${rectangle.y * zoom}px;width:${rectangle.width * zoom}px;height:${
            rectangle.height * zoom
        }px`;
    }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
    class="shape-editor relative select-none outline-none"
    style:width="{frameWidth * zoom}px"
    style:height="{frameHeight * zoom}px"
    tabindex="0"
    role="application"
    data-testid="entityShapeEditor"
    onkeydown={onKeyDown}
    onpointermove={onPointerMove}
    onpointerup={endDrag}
    onpointercancel={endDrag}
>
    <div
        class="absolute inset-0 shape-image"
        style:background-image="url('{imageSource}')"
        style:background-size="{frameWidth * frameCount * zoom}px {frameHeight * zoom}px"
    ></div>
    {#each [{ kind: "water", shape: water }, { kind: "hitbox", shape: hitbox }] as const as { kind, shape } (kind)}
        {#if shape}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
                class="absolute shape {kind}"
                class:active={active === kind}
                style={boxStyle(shape)}
                onpointerdown={(event) => active === kind && startDrag(event, "move")}
            >
                {#if active === kind}
                    {#each HANDLES as handle (handle)}
                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                        <div class="handle {handle}" onpointerdown={(event) => startDrag(event, handle)}></div>
                    {/each}
                {/if}
            </div>
        {/if}
    {/each}
</div>

<style>
    .shape-editor {
        image-rendering: pixelated;
        background-color: rgb(255 255 255 / 0.06);
        background-image:
            linear-gradient(45deg, rgb(255 255 255 / 0.08) 25%, transparent 25%),
            linear-gradient(-45deg, rgb(255 255 255 / 0.08) 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, rgb(255 255 255 / 0.08) 75%),
            linear-gradient(-45deg, transparent 75%, rgb(255 255 255 / 0.08) 75%);
        background-size: 12px 12px;
        background-position:
            0 0,
            0 6px,
            6px -6px,
            -6px 0;
    }

    .shape-editor:focus-visible {
        box-shadow: 0 0 0 2px #ffd75e;
    }

    .shape-image {
        background-repeat: no-repeat;
        background-position: 0 0;
        image-rendering: pixelated;
    }

    .shape {
        box-sizing: border-box;
        border: 1px dashed;
        pointer-events: none;
        opacity: 0.55;
    }

    .shape.active {
        pointer-events: auto;
        border-style: solid;
        border-width: 2px;
        opacity: 1;
        cursor: move;
    }

    .shape.hitbox {
        border-color: #ff6b6b;
        background: rgb(255 80 80 / 0.3);
    }

    .shape.water {
        border-color: #6cc8ff;
        background: rgb(80 180 255 / 0.3);
    }

    .handle {
        position: absolute;
        width: 8px;
        height: 8px;
        background: #ffd75e;
        border: 1px solid #000;
        transform: translate(-50%, -50%);
    }

    .handle.nw {
        left: 0;
        top: 0;
        cursor: nwse-resize;
    }

    .handle.n {
        left: 50%;
        top: 0;
        cursor: ns-resize;
    }

    .handle.ne {
        left: 100%;
        top: 0;
        cursor: nesw-resize;
    }

    .handle.e {
        left: 100%;
        top: 50%;
        cursor: ew-resize;
    }

    .handle.se {
        left: 100%;
        top: 100%;
        cursor: nwse-resize;
    }

    .handle.s {
        left: 50%;
        top: 100%;
        cursor: ns-resize;
    }

    .handle.sw {
        left: 0;
        top: 100%;
        cursor: nesw-resize;
    }

    .handle.w {
        left: 0;
        top: 50%;
        cursor: ew-resize;
    }
</style>
