<script lang="ts">
    import { tick } from "svelte";
    import { clickOutside } from "svelte-outside";
    import { DEFAULT_POOL_STYLE } from "@workadventure/map-editor";
    import type { FloorLevelStack } from "../../Stores/FloorLevelsStore";
    import { LL, locale } from "../../../i18n/i18n-svelte";
    import { altitudeLabel, metresLabel, SOIL_NAME_CH } from "../../Phaser/Game/Floors/AvatarAltitude";
    import { SOIL_TINTS } from "../../Phaser/Game/Terrain/TerrainShading";
    import { pointerFloodRiseStore } from "../../Stores/CatastropheStore";
    import { floorLevelViewedStore, levelChangePulses } from "../../Stores/FloorLevelsStore";
    import { IconCheck, IconChevronDown, IconDroplet, IconSnowflake } from "@wa-icons";

    interface Props {
        /** The floors of the map and the one of the avatar; undefined: nothing to show. */
        stack: FloorLevelStack | undefined;
        onSelectFloor?: (elevation: number | undefined) => void;
        allowAuto?: boolean;
        fullWidth?: boolean;
    }

    let { stack, onSelectFloor, allowAuto = true, fullWidth = false }: Props = $props();
    const menuId = $props.id();
    let value = $derived(stack?.viewed === undefined ? "" : String(stack.viewed));
    let options = $derived([
        ...(allowAuto
            ? [
                  {
                      value: "",
                      label: `${$LL.mapEditor.mapLayer.floorLevel.auto()} · ${stack?.levels.find((level) => level.elevation === stack.current)?.name ?? ""}`,
                  },
              ]
            : []),
        ...(stack?.levels.map((level) => ({
            value: String(level.elevation),
            label: `${level.elevation === stack.current ? "● " : ""}${level.name}`,
        })) ?? []),
    ]);

    // Under the pointer: the ground, the surface of the water (or of its ice) and its depth, each one named.
    let pointer = $derived(stack?.pointer);
    let groundFigure = $derived(pointer ? metresLabel(pointer.ground, $locale) : "—");
    let surfaceFigure = $derived(pointer?.surface === undefined ? "—" : metresLabel(pointer.surface, $locale));
    // A film thinner than half a decimetre is water too: told as such, not as "0 m".
    let depthFigure = $derived(
        pointer?.depth === undefined
            ? ""
            : pointer.depth === 0
              ? `< ${metresLabel(0.1, $locale, false)}`
              : metresLabel(pointer.depth, $locale, false),
    );
    // How much higher the water is here than before the hurricane (negative: lower), when one is followed.
    let floodRise = $derived($pointerFloodRiseStore);
    let waterName = $derived(
        pointer?.ice
            ? $LL.mapEditor.mapLayer.floorLevel.pointerIce()
            : $LL.mapEditor.mapLayer.floorLevel.pointerWater(),
    );
    // The soil under the pointer, named as in the relief tool; a cell not painted is the earth the water reads there.
    let soilLabel = $derived(
        pointer === undefined
            ? ""
            : pointer.soil === "pool"
              ? $LL.mapEditor.terrain.pool()
              : $LL.mapEditor.terrain.soils[pointer.soil ?? "earth"](),
    );
    let soilHint = $derived(
        pointer !== undefined && pointer.soil === undefined
            ? $LL.mapEditor.mapLayer.floorLevel.pointerUnpainted({ soil: soilLabel })
            : soilLabel,
    );
    // The colour of the soil on the map (its tint in the relief tool), the water of a pool for a pool.
    let soilColour = $derived(
        pointer === undefined
            ? "transparent"
            : pointer.soil === "pool"
              ? DEFAULT_POOL_STYLE.water
              : `#${SOIL_TINTS[pointer.soil ?? "earth"].color.toString(16).padStart(6, "0")}`,
    );
    let roughnessFigure = $derived(
        pointer?.roughness === undefined
            ? undefined
            : new Intl.NumberFormat($locale, { maximumFractionDigits: 3 }).format(pointer.roughness),
    );
    let pointerHint = $derived(
        pointer === undefined
            ? `${$LL.mapEditor.mapLayer.floorLevel.pointerAltitude()} · ${$LL.mapEditor.mapLayer.floorLevel.pointerOff()}`
            : [
                  `${$LL.mapEditor.mapLayer.floorLevel.pointerGround()} ${groundFigure}`,
                  soilHint,
                  ...(roughnessFigure === undefined
                      ? []
                      : [$LL.mapEditor.mapLayer.floorLevel.pointerRoughness({ n: roughnessFigure })]),
                  pointer.surface === undefined
                      ? $LL.mapEditor.mapLayer.floorLevel.pointerNoWater()
                      : `${waterName} ${surfaceFigure}`,
                  ...(pointer.depth === undefined
                      ? []
                      : [$LL.mapEditor.mapLayer.floorLevel.pointerDepth({ depth: depthFigure })]),
              ].join(" · "),
    );

    let open = $state(false);
    let trigger = $state<HTMLButtonElement>();
    let menu = $state<HTMLDivElement>();
    let selectedLabel = $derived(options.find((option) => option.value === value)?.label ?? "");

    function close(): void {
        open = false;
    }

    async function showMenu(): Promise<void> {
        open = true;
        await tick();
        menu?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    }

    function selectFloor(selected: string): void {
        const elevation = selected === "" ? undefined : Number(selected);
        if (onSelectFloor) onSelectFloor(elevation);
        else floorLevelViewedStore.set(elevation);
        close();
        trigger?.focus();
    }

    function navigate(event: KeyboardEvent): void {
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            close();
            trigger?.focus();
            return;
        }
        if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        const items = Array.from(menu?.querySelectorAll<HTMLButtonElement>("button") ?? []);
        const index = items.findIndex((item) => item === document.activeElement);
        const next =
            event.key === "Home"
                ? 0
                : event.key === "End"
                  ? items.length - 1
                  : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
    }

    const reducedMotion =
        typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
    let shownCurrent: number | undefined = undefined;
    let pulse = $state(false);
    let pulseTimer: ReturnType<typeof setTimeout> | undefined;

    $effect(() => {
        const current = stack?.current;
        if (current === undefined) return;
        if (levelChangePulses(shownCurrent, current, reducedMotion)) {
            pulse = true;
            clearTimeout(pulseTimer);
            pulseTimer = setTimeout(() => (pulse = false), 600);
        }
        shownCurrent = current;
    });

    $effect(() => () => clearTimeout(pulseTimer));
</script>

{#if stack}
    <div
        class="floor-level-stack relative z-10 rounded-lg bg-contrast/80 text-xs backdrop-blur"
        class:full-width={fullWidth}
        class:relief={stack.altitude !== undefined && !fullWidth}
        class:pulse
        use:clickOutside={close}
    >
        <button
            bind:this={trigger}
            type="button"
            class="flex w-full items-center gap-2 rounded-lg px-3 py-2 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-pop-green"
            aria-label={$LL.mapEditor.mapLayer.floorLevel.title()}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls={menuId}
            onclick={async () => {
                if (open) close();
                else await showMenu();
            }}
            onkeydown={async (event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault();
                    event.stopPropagation();
                    await showMenu();
                }
            }}
        >
            <svg class="h-4 w-4 shrink-0 text-pop-green" viewBox="0 0 24 24" aria-hidden="true">
                <path d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5" />
            </svg>
            <span class="flex-1 truncate text-left">{selectedLabel}</span>
            {#if stack.altitude !== undefined}
                <span
                    class="shrink-0 tabular-nums opacity-80"
                    title={$LL.mapEditor.mapLayer.floorLevel.altitude()}
                    data-testid="avatar-altitude"
                >
                    <span class="sr-only">{$LL.mapEditor.mapLayer.floorLevel.altitude()}</span>
                    {altitudeLabel(stack.altitude, $locale)}
                </span>
            {/if}
            <IconChevronDown class="h-3 w-3 shrink-0 opacity-60" />
        </button>
        {#if stack.altitude !== undefined}
            <!-- Under the pointer, on a line of its own that stays while the pointer is off the game (dashes then):
                 the stack keeps its size, the figures keep their place. -->
            <div
                class="pointer-ground flex items-center gap-1.5 px-3 pb-1.5 tabular-nums"
                title={pointerHint}
                data-testid="pointer-ground"
            >
                <svg class="h-3 w-3 shrink-0 opacity-60" viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="6" />
                    <path d="M12 2v6M12 16v6M2 12h6M16 12h6" />
                </svg>
                <span class="sr-only">{pointerHint}</span>
                <!-- The mountain is filled with the colour of the soil; its name shows where the layout is wide. -->
                <span class="flex shrink-0 items-center gap-0.5" aria-hidden="true">
                    <svg class="h-3 w-3 shrink-0 opacity-90" viewBox="0 0 24 24" data-testid="pointer-soil-swatch">
                        <path d="M3 20h18L14.079 5.388a2.3 2.3 0 0 0-4.158 0z" style:fill={soilColour} />
                        <path d="m7.5 11l2 2.5L12 11l2 3l2.5-2" />
                    </svg>
                    <span
                        class="soil-name truncate opacity-80"
                        style:min-width={`${SOIL_NAME_CH}ch`}
                        data-testid="pointer-soil">{soilLabel}</span
                    >
                    <span class="figure opacity-80">{groundFigure}</span>
                </span>
                <span
                    class="flex shrink-0 items-center gap-0.5 {pointer?.surface === undefined
                        ? 'opacity-40'
                        : pointer.ice
                          ? 'text-sky-100'
                          : 'text-sky-300'}"
                    aria-hidden="true"
                    data-testid="pointer-water"
                >
                    {#if pointer?.ice}<IconSnowflake class="h-3 w-3 shrink-0" />{:else}<IconDroplet
                            class="h-3 w-3 shrink-0"
                        />{/if}
                    <span class="figure">{surfaceFigure}</span>
                </span>
                {#if pointer?.depth !== undefined}
                    <span
                        class="flex shrink-0 items-center gap-0.5 opacity-70"
                        aria-hidden="true"
                        data-testid="pointer-depth"
                    >
                        <svg class="h-3 w-3 shrink-0" viewBox="0 0 24 24">
                            <path d="M12 4v16M8 8l4-4 4 4M8 16l4 4 4-4" />
                        </svg>
                        {depthFigure}
                    </span>
                {/if}
                {#if floodRise !== undefined && Math.abs(floodRise) >= 0.05}
                    <span
                        class="shrink-0 text-sky-300"
                        title={$LL.mapEditor.mapLayer.floorLevel.pointerFloodRise()}
                        aria-label={$LL.mapEditor.mapLayer.floorLevel.pointerFloodRise()}
                        data-testid="pointer-flood-rise"
                    >
                        {metresLabel(floodRise, $locale)}
                    </span>
                {/if}
            </div>
        {/if}
        {#if open}
            <div
                bind:this={menu}
                id={menuId}
                role="menu"
                tabindex="-1"
                aria-label={$LL.mapEditor.mapLayer.floorLevel.title()}
                class="absolute right-0 top-full z-10 mt-1 max-h-72 overflow-y-auto w-full rounded-lg border border-white/10 bg-contrast p-1 shadow-lg"
                onkeydown={navigate}
                onfocusout={(event) => {
                    if (
                        event.relatedTarget instanceof Node &&
                        !menu?.contains(event.relatedTarget) &&
                        event.relatedTarget !== trigger
                    )
                        close();
                }}
            >
                {#each options as option (option.value)}
                    <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={option.value === value}
                        class="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none {option.value ===
                        value
                            ? 'text-pop-green bg-white/5'
                            : ''}"
                        onclick={() => selectFloor(option.value)}
                    >
                        <span class="flex-1 truncate">{option.label}</span>
                        {#if option.value === value}<IconCheck class="h-3 w-3 shrink-0" />{/if}
                    </button>
                {/each}
            </div>
        {/if}
    </div>
{/if}

<style>
    .floor-level-stack {
        pointer-events: auto;
        width: 200px;
    }
    /* The figures under the pointer keep their width ("+9,4 m" at most: the relief stays within ±8.8 m and the water
       within a few decimetres over it), so that nothing moves when the pointer does. */
    .pointer-ground {
        font-size: 11px;
        line-height: 14px;
    }
    .figure {
        display: inline-block;
        min-width: 6ch;
        text-align: right;
    }
    .full-width {
        width: 100%;
    }
    /* The name of the soil under the pointer only where the layout is wide (from 1024 px, the "lg" of the main
       layout): the stack then widens by the room of the longest name. Narrower, the colour of the mountain tells it,
       and its name is in the hint. */
    .soil-name {
        display: none;
        max-width: 8ch;
    }
    @container main-layout (min-width: 1024px) {
        .relief {
            width: 250px;
        }
        .soil-name {
            display: inline-block;
        }
    }
    svg {
        fill: none;
        stroke: currentColor;
        stroke-width: 1.6;
    }
    .pulse {
        animation: floor-level-pulse 0.6s ease-out;
    }
    @keyframes floor-level-pulse {
        0%,
        100% {
            transform: scale(1);
        }
        40% {
            transform: scale(1.04);
        }
    }
</style>
