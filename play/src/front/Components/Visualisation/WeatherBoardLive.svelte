<script lang="ts">
    import { untrack } from "svelte";
    import { weatherBoardNow } from "@wa/front/Phaser/Game/Weather/WeatherBoardNow";
    import { LL } from "../../../i18n/i18n-svelte";
    import { gameManager } from "../../Phaser/Game/GameManager";
    import { nightDateStore } from "../../Stores/NightStore";
    import { weatherExplainedStore } from "../../Stores/VisualisationStore";
    import WeatherBoard from "./WeatherBoard.svelte";
    import { weatherBoardFit, type WeatherBoardFit } from "./WeatherBoardFit";
    import { IconX } from "@wa-icons";

    /**
     * The weather board of now: read again at each tick of the game clock (every second), only while it is open (it
     * is not mounted otherwise).
     */
    const board = $derived.by(() => {
        const date = $nightDateStore;
        if (!date) return undefined;
        const scene = gameManager.getCurrentGameScene();
        return weatherBoardNow(
            scene.getGameMap().getWamFile()?.getWam().settings,
            date,
            scene.getMeadow(),
            scene.CurrentPlayer,
        );
    });

    function sameFit(a: WeatherBoardFit | undefined, b: WeatherBoardFit): boolean {
        if (!a || a.overlay !== b.overlay || a.maxHeight !== b.maxHeight) return false;
        return !a.overlay || !b.overlay || a.top === b.top;
    }

    /** Where the board would start in its place in the column: what is above it decides, never the board itself. */
    let anchor: HTMLDivElement | undefined = $state();
    let fit: WeatherBoardFit | undefined = $state();
    /** The top of the board laid over the panels, from the top of the column it is positioned in (px). */
    let overlayOffset = $state(0);

    /** The measure of the room under the panels, while the board is shown. */
    let remeasure: (() => void) | undefined;

    /**
     * Measures the room left under the panels above the board, at once and whenever the column or the window changes
     * size (a weather card unfolded or folded, a panel opened): the board never goes past the bottom of the window.
     */
    $effect(() => {
        const here = anchor;
        if (!here) return;
        const column = here.offsetParent instanceof HTMLElement ? here.offsetParent : here.parentElement;
        const measure = (): void => {
            // The clock line tops the column of the clock: the board laid over the panels starts just under it.
            const clockLine = column?.querySelector('[data-testid="clock-line"]');
            const overlayTop = (clockLine?.getBoundingClientRect().bottom ?? here.getBoundingClientRect().top) + 8;
            const next = weatherBoardFit(window.innerHeight, here.getBoundingClientRect().top, overlayTop);
            // Written only when it changes: the board resizing the column must not measure it again and again.
            if (!sameFit(fit, next)) fit = next;
            const offset = next.overlay ? next.top - (column?.getBoundingClientRect().top ?? 0) : 0;
            if (offset !== overlayOffset) overlayOffset = offset;
        };
        untrack(measure);
        remeasure = measure;
        window.addEventListener("resize", measure);
        const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
        if (column) observer?.observe(column);
        return () => {
            window.removeEventListener("resize", measure);
            observer?.disconnect();
            remeasure = undefined;
        };
    });

    // The column may also move without changing size (the side panel under it): measured again with each new board,
    // once a second; written only when the room changes.
    $effect(() => {
        if (board) untrack(() => remeasure?.());
    });
</script>

<div bind:this={anchor} class="h-0 w-0" aria-hidden="true"></div>
{#if board}
    <!-- The board scrolls inside the room it is given; laid over the panels when too little is left under them. -->
    <div
        class="flex flex-col [&>section]:max-h-none [&>section]:min-h-0 [&>section]:overscroll-contain {fit?.overlay
            ? 'absolute end-0 z-10 rounded-xl bg-contrast shadow-2xl'
            : 'relative'}"
        style:max-height={fit ? `${fit.maxHeight}px` : "60vh"}
        style:top={fit?.overlay ? `${overlayOffset}px` : undefined}
        data-testid="weather-board-fit"
        data-overlay={fit?.overlay ? "true" : "false"}
    >
        <WeatherBoard {board} />
        {#if fit?.overlay}
            <!-- Over the panels, the tile that opened the board may be under it: it closes here. -->
            <button
                type="button"
                class="absolute end-1 top-1 rounded-full p-1 text-white/70 hover:bg-white/10 hover:text-white"
                aria-label={$LL.actionbar.visualisation.weather.close()}
                data-testid="weather-board-close"
                onclick={() => weatherExplainedStore.set(false)}
            >
                <IconX font-size="14" />
            </button>
        {/if}
    </div>
{/if}
