<script lang="ts">
    import { onDestroy, tick } from "svelte";
    import { wokaMenuStore } from "@wa/front/Stores/WokaMenuStore";
    import type { WokaMenuData } from "@wa/front/Stores/WokaMenuStore";
    import { currentPlayerWokaStore } from "@wa/front/Stores/CurrentPlayerWokaStore";
    import { torchEquippedStore, torchIntensityStore } from "@wa/front/Stores/TorchStore";
    import {
        TORCH_INTENSITY_MAX,
        TORCH_INTENSITY_MIN,
        TORCH_INTENSITY_STEP,
    } from "@wa/front/Phaser/Game/Torch/TorchProtocol";
    import LL from "@wa/i18n/i18n-svelte";
    import { WHEEL_GRID, wheelCell } from "./PixelWheel";
    import PixelIcon from "./PixelIcon.svelte";

    let { menu }: { menu: WokaMenuData } = $props();
    const profileAction = $derived(menu.actions.find((action) => action.testId === "avatar-profile"));
    const actions = $derived(menu.actions.filter((action) => action !== profileAction));
    // While the torch is held, its intensity can be set under the wheel (not in a submenu, which has no torch).
    const torchIntensityShown = $derived(
        $torchEquippedStore && menu.actions.some((action) => action.testId === "avatar-torch"),
    );
    /** The two buttons of the intensity come after the actions and the profile, when going around the wheel. */
    const intensityIndex = $derived(actions.length + (profileAction ? 1 : 0));
    const buttonCount = $derived(intensityIndex + (torchIntensityShown ? 2 : 0));
    /** The height the intensity takes under the wheel, kept on the screen with it. */
    const INTENSITY_HEIGHT = 40;
    let width = $state(0);
    let height = $state(0);
    let selected = $state(0);
    let buttons: HTMLButtonElement[] = [];
    const size = $derived(Math.min(300, width - 16, height - 16));
    const x = $derived(Math.max(size / 2 + 8, Math.min(menu.menuPosition?.x ?? width / 2, width - size / 2 - 8)));
    const y = $derived(
        Math.max(
            size / 2 + 8,
            Math.min(
                menu.menuPosition?.y ?? height / 2,
                height - size / 2 - 8 - (torchIntensityShown ? INTENSITY_HEIGHT : 0),
            ),
        ),
    );

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

    // While the intensity is being set, the rest of the wheel almost vanishes: the avatar and its light show through.
    let intensityHovered = $state(false);
    let intensityFocused = $state(false);
    const faded = $derived(torchIntensityShown && (intensityHovered || intensityFocused));

    function onIntensityFocusOut(event: FocusEvent): void {
        const group = event.currentTarget;
        // From one of its buttons to the other: still focused.
        intensityFocused =
            group instanceof HTMLElement && event.relatedTarget instanceof Node && group.contains(event.relatedTarget);
    }

    /** One step dimmer or brighter; the wheel stays open to take several. */
    function stepTorchIntensity(direction: -1 | 1): void {
        torchIntensityStore.update((percent) => percent + direction * TORCH_INTENSITY_STEP);
    }

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
    class:faded
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
        {@const center = point(104, (index * Math.PI * 2) / actions.length - Math.PI / 2)}
        <button
            bind:this={buttons[index]}
            class="wheel-action"
            class:selected={selected === index}
            style:clip-path={sectorPolygon(index)}
            data-testid={action.testId}
            aria-disabled={action.disabled === true}
            onpointerenter={() => (selected = index)}
            onfocus={() => (selected = index)}
            onclick={() => {
                if (!action.disabled) action.callback();
            }}
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
                {#if action.detail}<span class="wheel-detail">{action.detail}</span>{/if}
            </span>
        </button>
    {/each}
    {#if torchIntensityShown}
        <div
            class="wheel-intensity"
            role="group"
            aria-label={$LL.actionbar.torch.intensity()}
            data-testid="avatar-torch-intensity"
            onpointerenter={() => (intensityHovered = true)}
            onpointerleave={() => (intensityHovered = false)}
            onfocusin={() => (intensityFocused = true)}
            onfocusout={onIntensityFocusOut}
        >
            <PixelIcon name="torch" size={16} />
            <button
                bind:this={buttons[intensityIndex]}
                class="wheel-step"
                class:selected={selected === intensityIndex}
                aria-label={$LL.actionbar.torch.dim()}
                aria-disabled={$torchIntensityStore <= TORCH_INTENSITY_MIN}
                data-testid="avatar-torch-intensity-lower"
                onpointerenter={() => (selected = intensityIndex)}
                onfocus={() => (selected = intensityIndex)}
                onclick={() => stepTorchIntensity(-1)}>−</button
            >
            <output aria-live="polite" data-testid="avatar-torch-intensity-value"
                >{$LL.actionbar.torch.percent({ percent: $torchIntensityStore })}</output
            >
            <button
                bind:this={buttons[intensityIndex + 1]}
                class="wheel-step"
                class:selected={selected === intensityIndex + 1}
                aria-label={$LL.actionbar.torch.brighten()}
                aria-disabled={$torchIntensityStore >= TORCH_INTENSITY_MAX}
                data-testid="avatar-torch-intensity-raise"
                onpointerenter={() => (selected = intensityIndex + 1)}
                onfocus={() => (selected = intensityIndex + 1)}
                onclick={() => stepTorchIntensity(1)}>+</button
            >
        </div>
    {/if}
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
    /* An action that cannot be taken here: greyed, its detail tells why. */
    .wheel-action[aria-disabled="true"] {
        cursor: default;
    }
    .wheel-action[aria-disabled="true"] .wheel-icon {
        filter: grayscale(1);
        opacity: 0.5;
    }
    .wheel-action:focus-visible .wheel-action-label {
        text-decoration: underline;
    }
    .wheel-icon {
        display: flex;
        font-size: 25px;
        line-height: 1;
    }
    /*
     * Faded while the intensity is set: only seen, the wheel still takes the clicks (nothing reaches the map) and keeps
     * its keyboard navigation. The control stays opaque; its own shadow replaces the wheel's.
     */
    .avatar-wheel > :not(.wheel-intensity) {
        transition: opacity 150ms ease-out;
    }
    .avatar-wheel.faded {
        filter: none;
    }
    .avatar-wheel.faded > :not(.wheel-intensity) {
        opacity: 0.12;
    }
    .avatar-wheel.faded .wheel-intensity {
        filter: drop-shadow(0 4px 0 #0007);
    }
    @media (prefers-reduced-motion: reduce) {
        .avatar-wheel > :not(.wheel-intensity) {
            transition: none;
        }
    }
    /* The intensity of the torch, just under the wheel, in the colors of its sectors. */
    .wheel-intensity {
        position: absolute;
        top: calc(100% + 4px);
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 8px;
        background: var(--rt-surface-raised);
        border: 2px solid var(--rt-bg-deep);
        color: var(--rt-text);
        font-size: 11px;
        white-space: nowrap;
    }
    .wheel-intensity output {
        min-width: 4ch;
        text-align: center;
    }
    .wheel-step {
        width: 24px;
        height: 24px;
        border: 2px solid var(--rt-bg-deep);
        background: var(--rt-bg);
        color: var(--rt-text);
        font: inherit;
        font-size: 14px;
        line-height: 1;
        cursor: pointer;
    }
    .wheel-step.selected {
        background: var(--rt-accent);
        border-color: var(--rt-text);
        color: #fff;
    }
    .wheel-step[aria-disabled="true"] {
        opacity: 0.4;
        cursor: default;
    }
    .wheel-step:focus-visible {
        outline: 2px solid var(--rt-highlight);
    }
    /* Up to three short lines under the name, so it stays inside its sector. */
    .wheel-detail {
        display: -webkit-box;
        max-width: 62px;
        overflow: hidden;
        -webkit-line-clamp: 3;
        line-clamp: 3;
        -webkit-box-orient: vertical;
        font-size: 9px;
        line-height: 1.15;
        color: var(--rt-muted);
    }
</style>
