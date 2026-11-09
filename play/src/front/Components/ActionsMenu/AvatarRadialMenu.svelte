<script lang="ts">
    import { onDestroy, tick } from "svelte";
    import { wokaMenuStore } from "@wa/front/Stores/WokaMenuStore";
    import type { WokaMenuData } from "@wa/front/Stores/WokaMenuStore";
    import { currentPlayerWokaStore } from "@wa/front/Stores/CurrentPlayerWokaStore";
    import LL from "@wa/i18n/i18n-svelte";
    import { WHEEL_GRID, wheelCell } from "./PixelWheel";
    import PixelIcon from "./PixelIcon.svelte";

    let { menu }: { menu: WokaMenuData } = $props();
    const profileAction = $derived(menu.actions.find((action) => action.testId === "avatar-profile"));
    const actions = $derived(menu.actions.filter((action) => action !== profileAction));
    const buttonCount = $derived(actions.length + (profileAction ? 1 : 0));
    let width = $state(0);
    let height = $state(0);
    let selected = $state(0);
    let buttons: HTMLButtonElement[] = [];
    const size = $derived(Math.min(300, width - 16, height - 16));
    const x = $derived(Math.max(size / 2 + 8, Math.min(menu.menuPosition?.x ?? width / 2, width - size / 2 - 8)));
    const y = $derived(Math.max(size / 2 + 8, Math.min(menu.menuPosition?.y ?? height / 2, height - size / 2 - 8)));

    function point(radius: number, angle: number): { x: number; y: number } {
        return { x: 150 + Math.cos(angle) * radius, y: 150 + Math.sin(angle) * radius };
    }

    function sectorPolygon(index: number): string {
        const step = (Math.PI * 2) / actions.length;
        const start = index * step - Math.PI / 2 - step / 2;
        const points = [
            ...Array.from({ length: 13 }, (_, i) => point(146, start + (i * step) / 12)),
            ...Array.from({ length: 13 }, (_, i) => point(52, start + ((12 - i) * step) / 12)),
        ];
        return `polygon(${points.map((p) => `${p.x / 3}% ${p.y / 3}%`).join(",")})`;
    }

    let wheelElement: HTMLDivElement | undefined = $state();
    let canvas: HTMLCanvasElement | undefined = $state();

    /** Draws the wheel cell by cell, in the colors of the interface theme; the selected sector lights up. */
    function drawWheel(context: CanvasRenderingContext2D, style: CSSStyleDeclaration): void {
        const color = (token: string) => style.getPropertyValue(token).trim();
        const colors = {
            sector: color("--rt-surface-raised"),
            selected: color("--rt-accent"),
            edge: color("--rt-bg-deep"),
            selectedEdge: color("--rt-text"),
            center: color("--rt-bg"),
            centerEdge: color("--rt-line-strong"),
            marker: color("--rt-highlight"),
        };
        const profileSelected = profileAction !== undefined && selected === actions.length;
        context.clearRect(0, 0, WHEEL_GRID, WHEEL_GRID);
        for (let y = 0; y < WHEEL_GRID; y++) {
            for (let x = 0; x < WHEEL_GRID; x++) {
                const cell = wheelCell(x, y, actions.length);
                if (cell.kind === "empty") continue;
                if (cell.kind === "gap") {
                    context.fillStyle = colors.edge;
                    context.fillRect(x, y, 1, 1);
                    continue;
                }
                const lit = cell.kind === "center" ? profileSelected : selected === cell.index;
                context.fillStyle = cell.edge
                    ? lit
                        ? colors.selectedEdge
                        : cell.kind === "center"
                          ? colors.centerEdge
                          : colors.edge
                    : lit
                      ? colors.selected
                      : cell.kind === "center"
                        ? colors.center
                        : colors.sector;
                context.fillRect(x, y, 1, 1);
            }
        }
        // The small square "pixel" of the selected choice, as in the rest of the interface, at the rim of its sector.
        if (selected < actions.length) {
            const angle = (selected * Math.PI * 2) / actions.length;
            const markerX = Math.round(WHEEL_GRID / 2 + Math.sin(angle) * 43) - 1;
            const markerY = Math.round(WHEEL_GRID / 2 - Math.cos(angle) * 43) - 1;
            context.fillStyle = colors.marker;
            context.fillRect(markerX, markerY, 2, 2);
        }
    }

    $effect(() => {
        const context = canvas?.getContext("2d");
        if (!context || !wheelElement) return;
        // Redrawn when the actions or the selection change (both are read while drawing).
        drawWheel(context, getComputedStyle(wheelElement));
    });

    function close(): void {
        wokaMenuStore.clear();
    }

    function onKeyDown(event: KeyboardEvent): void {
        if (event.key === "Escape") {
            event.preventDefault();
            close();
        } else if (["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Tab"].includes(event.key)) {
            event.preventDefault();
            const forward =
                event.key === "ArrowRight" || event.key === "ArrowDown" || (event.key === "Tab" && !event.shiftKey);
            selected = (selected + (forward ? 1 : -1) + buttonCount) % buttonCount;
            buttons[selected]?.focus();
        }
    }

    const previousFocus = document.activeElement;
    $effect(() => {
        // A submenu replaces its buttons without remounting the wheel.
        if (!actions[0]) return;
        selected = 0;
        tick()
            .then(() => buttons[0]?.focus())
            .catch((error) => console.error("Could not focus avatar actions", error));
    });
    onDestroy(() => {
        if (previousFocus instanceof HTMLElement) previousFocus.focus();
    });
</script>

<svelte:window bind:innerWidth={width} bind:innerHeight={height} onkeydown={onKeyDown} />

<button class="wheel-dismiss" aria-label={$LL.woka.menu.closeActions()} onclick={close}></button>
<div
    class="avatar-wheel retro-theme"
    bind:this={wheelElement}
    style:left="{x}px"
    style:top="{y}px"
    style:width="{size}px"
    style:height="{size}px"
    data-testid="avatar-radial-menu"
    role="group"
    aria-label={$LL.woka.menu.actions()}
>
    <canvas class="wheel-pixels" bind:this={canvas} width={WHEEL_GRID} height={WHEEL_GRID} aria-hidden="true"></canvas>
    {#snippet centerContent()}
        {#if $currentPlayerWokaStore}<img src={$currentPlayerWokaStore} alt="" />{/if}
        <span>{menu.wokaName}</span>
    {/snippet}
    {#if profileAction}
        <button
            class="wheel-center wheel-profile"
            bind:this={buttons[actions.length]}
            aria-label={profileAction.actionName}
            data-testid="avatar-profile"
            onpointerenter={() => (selected = actions.length)}
            onfocus={() => (selected = actions.length)}
            onclick={profileAction.callback}
        >
            {@render centerContent()}
        </button>
    {:else}
        <div class="wheel-center">{@render centerContent()}</div>
    {/if}
    {#each actions as action, index (action.uuid)}
        {@const center = point(97, (index * Math.PI * 2) / actions.length - Math.PI / 2)}
        <button
            bind:this={buttons[index]}
            class="wheel-action"
            class:selected={selected === index}
            style:clip-path={sectorPolygon(index)}
            data-testid={action.testId}
            onpointerenter={() => (selected = index)}
            onfocus={() => (selected = index)}
            onclick={action.callback}
        >
            <span
                class="wheel-action-label"
                style:left="{(center.x / 300) * 100}%"
                style:top="{(center.y / 300) * 100}%"
            >
                <span class="wheel-icon" aria-hidden="true"
                    >{#if action.icon}<PixelIcon name={action.icon} size={32} />{:else}{action.emoji}{/if}</span
                >
                <span>{action.actionName}</span>
            </span>
        </button>
    {/each}
</div>

<style>
    .wheel-dismiss {
        position: fixed;
        inset: 0;
        z-index: 70;
        background: transparent;
        border: 0;
        pointer-events: auto;
    }
    .avatar-wheel {
        position: fixed;
        z-index: 71;
        transform: translate(-50%, -50%);
        pointer-events: auto;
        filter: drop-shadow(0 6px 0 #0007);
    }
    .avatar-wheel {
        /* Only the theme's colors and font: not the frosted panel behind it, the wheel is round. */
        background: transparent;
        backdrop-filter: none;
        border: 0;
        font-family: var(--font-main);
        animation: wheel-open 120ms steps(3, end);
    }
    @keyframes wheel-open {
        from {
            transform: translate(-50%, -50%) scale(0.7);
        }
        to {
            transform: translate(-50%, -50%) scale(1);
        }
    }
    .wheel-pixels {
        width: 100%;
        height: 100%;
        image-rendering: pixelated;
    }
    .wheel-center {
        position: absolute;
        inset: 34%;
        font-family: var(--font-main);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: var(--rt-text);
        font-size: 10px;
        pointer-events: none;
    }
    .wheel-profile {
        pointer-events: auto;
        cursor: pointer;
        border: 0;
        padding: 0;
        background: transparent;
        border-radius: 50%;
    }
    .wheel-profile:focus-visible {
        outline: 2px solid var(--rt-highlight);
    }
    .wheel-center img {
        width: 45px;
        height: 45px;
        image-rendering: pixelated;
        object-fit: contain;
    }
    .wheel-center span {
        max-width: 80px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .wheel-action {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        border: 0;
        padding: 0;
        color: var(--rt-text);
        background: transparent;
        cursor: pointer;
        font: inherit;
        font-family: var(--font-main);
        font-size: 11px;
        line-height: 1.25;
        text-align: center;
    }
    .wheel-action-label {
        position: absolute;
        transform: translate(-50%, -50%);
        width: 86px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 4px;
    }
    .wheel-action.selected {
        color: #fff;
    }
    .wheel-action:focus-visible .wheel-action-label {
        text-decoration: underline;
    }
    .wheel-icon {
        display: flex;
        font-size: 25px;
        line-height: 1;
    }
</style>
