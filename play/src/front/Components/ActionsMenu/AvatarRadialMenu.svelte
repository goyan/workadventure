<script lang="ts">
    import { onDestroy, tick } from "svelte";
    import { wokaMenuStore } from "../../Stores/WokaMenuStore";
    import type { WokaMenuData } from "../../Stores/WokaMenuStore";
    import { currentPlayerWokaStore } from "../../Stores/CurrentPlayerWokaStore";
    import LL from "../../../i18n/i18n-svelte";

    let { menu }: { menu: WokaMenuData } = $props();
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

    function sector(index: number): string {
        const step = (Math.PI * 2) / menu.actions.length;
        const start = index * step - Math.PI / 2 - step / 2 + 0.025;
        const end = start + step - 0.05;
        const a = point(143, start);
        const b = point(143, end);
        const c = point(55, end);
        const d = point(55, start);
        return `M ${a.x} ${a.y} A 143 143 0 0 1 ${b.x} ${b.y} L ${c.x} ${c.y} A 55 55 0 0 0 ${d.x} ${d.y} Z`;
    }

    function sectorPolygon(index: number): string {
        const step = (Math.PI * 2) / menu.actions.length;
        const start = index * step - Math.PI / 2 - step / 2;
        const points = [
            ...Array.from({ length: 13 }, (_, i) => point(146, start + (i * step) / 12)),
            ...Array.from({ length: 13 }, (_, i) => point(52, start + ((12 - i) * step) / 12)),
        ];
        return `polygon(${points.map((p) => `${p.x / 3}% ${p.y / 3}%`).join(",")})`;
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
            selected = (selected + (forward ? 1 : -1) + menu.actions.length) % menu.actions.length;
            buttons[selected]?.focus();
        }
    }

    const previousFocus = document.activeElement;
    $effect(() => {
        // A submenu replaces its buttons without remounting the wheel.
        if (!menu.actions[0]) return;
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
    class="avatar-wheel"
    style:left="{x}px"
    style:top="{y}px"
    style:width="{size}px"
    style:height="{size}px"
    data-testid="avatar-radial-menu"
    role="group"
    aria-label={$LL.woka.menu.actions()}
>
    <svg viewBox="0 0 300 300" aria-hidden="true">
        <circle cx="150" cy="150" r="146" fill="#0b1426" fill-opacity="0.94" stroke="#577487" />
        {#each menu.actions as action, index (action.uuid)}
            <path
                d={sector(index)}
                fill={selected === index ? "#256c72" : "#1b2b42"}
                stroke={selected === index ? "#a5fff0" : "#496079"}
            />
        {/each}
        <circle cx="150" cy="150" r="49" fill="#132033" stroke="#9ee7da" />
    </svg>
    <div class="wheel-center">
        {#if $currentPlayerWokaStore}<img src={$currentPlayerWokaStore} alt="" />{/if}
        <span>{menu.wokaName}</span>
    </div>
    {#each menu.actions as action, index (action.uuid)}
        {@const center = point(97, (index * Math.PI * 2) / menu.actions.length - Math.PI / 2)}
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
                <span class="wheel-icon" aria-hidden="true">{action.emoji}</span>
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
        filter: drop-shadow(0 8px 24px #0009);
    }
    svg {
        width: 100%;
        height: 100%;
    }
    .wheel-center {
        position: absolute;
        inset: 34%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: #d0eae6;
        font-size: 10px;
        pointer-events: none;
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
        color: #dce8f6;
        background: transparent;
        cursor: pointer;
        font: inherit;
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
        font-size: 25px;
        line-height: 1;
    }
</style>
