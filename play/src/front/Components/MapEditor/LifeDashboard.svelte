<script lang="ts">
    import { LIFE_RANGES } from "@workadventure/map-editor";
    import type { LifeRangeName } from "@workadventure/map-editor";
    import { LL } from "../../../i18n/i18n-svelte";
    import { formatDuration } from "../../Phaser/Game/Life/LifeDurations";
    import { chartPoints } from "../../Phaser/Game/Life/LifeStats";
    import { fishingCaughtStore } from "../../Stores/FishingStore";
    import { aquaticLifeStatsStore, lifeRangeStore } from "../../Stores/TerrainEditorStore";

    /** The curves are drawn in a box of this size; each has its own scale, with a little room above its largest value. */
    const CHART_WIDTH = 300;
    const CHART_HEIGHT = 110;
    const HEADROOM = 1.1;
    const EVENTS = ["births", "arrivals", "diedOfAge", "eaten", "diedDry", "predatorBirths", "predatorDeaths"] as const;

    let stats = $derived($aquaticLifeStatsStore);
    let totals = $derived(stats?.totals);
    let fill = $derived(
        stats && totals && totals.capacity > 0 ? Math.min(100, Math.round((stats.prey / totals.capacity) * 100)) : 0,
    );
    /** The curve shows one range of time at once: the last five minutes, hour, four hours, day, or the whole life. */
    const RANGES = [...LIFE_RANGES.map((range) => range.name), "all"] as const;
    let chosen = $state<LifeRangeName | "all">("5min");
    // The curves of the species, under this dashboard, show the same range.
    $effect(() => lifeRangeStore.set(chosen));
    let range = $derived(LIFE_RANGES.find((candidate) => candidate.name === chosen));
    let history = $derived((chosen === "all" ? stats?.history : stats?.ranges[chosen]) ?? []);
    let maxPrey = $derived(Math.max(1, ...history.map((sample) => sample.prey)));
    let maxPredators = $derived(Math.max(1, ...history.map((sample) => sample.predators)));
    /** A range is drawn whole, up to its last sample (the present); the whole life, from its first sample. */
    let last = $derived(history.length > 0 ? history[history.length - 1].at : 0);
    let chartWindow = $derived(range ? { from: last - range.spanMs, to: last } : undefined);
    /** How long the curve covers, in seconds. */
    let span = $derived(range ? range.spanMs / 1000 : history.length > 1 ? (last - history[0].at) / 1000 : 0);

    const round = (value: number): string => (value >= 10 ? String(Math.round(value)) : value.toFixed(1));
</script>

{#if !stats || (!totals && stats.prey + stats.predators === 0)}
    <p class="retro-hint m-0" role="status" data-testid="life-dashboard-empty">
        {$LL.mapEditor.life.dashboard.empty()}
    </p>
{:else}
    <div class="flex flex-col gap-1 text-sm text-white" role="status" data-testid="life-dashboard">
        <span class="text-xs uppercase text-white/50">{$LL.mapEditor.life.dashboard.population()}</span>
        <div class="flex justify-between" data-testid="life-prey">
            <span>{$LL.mapEditor.life.dashboard.prey()}</span>
            <span class="font-bold">{stats.prey}</span>
        </div>
        <div class="flex justify-end gap-3 text-xs">
            <span class="text-[#60a5fa]" data-testid="life-males"
                >{stats.males} {$LL.mapEditor.life.dashboard.males()}</span
            >
            <span class="text-[#f472b6]" data-testid="life-females"
                >{stats.females} {$LL.mapEditor.life.dashboard.females()}</span
            >
        </div>
        <div class="flex justify-between" data-testid="life-predators">
            <span>{$LL.mapEditor.life.dashboard.predators()}</span>
            <span class="font-bold">{stats.predators}</span>
        </div>
        <div class="flex justify-end gap-3 text-xs">
            <span class="text-[#93a9bd]" data-testid="life-predator-males"
                >{stats.predatorMales} {$LL.mapEditor.life.dashboard.males()}</span
            >
            <span class="text-[#c9a9c4]" data-testid="life-predator-females"
                >{stats.predatorFemales} {$LL.mapEditor.life.dashboard.females()}</span
            >
        </div>
        <div class="flex justify-between" data-testid="life-prey-per-predator">
            <span>{$LL.mapEditor.life.dashboard.preyPerPredator()}</span>
            <span>{stats.preyPerPredator === undefined ? "—" : round(stats.preyPerPredator)}</span>
        </div>
        {#if totals}
            <div class="flex justify-between" data-testid="life-capacity">
                <span>{$LL.mapEditor.life.dashboard.capacity()}</span>
                <span>{stats.prey} / {totals.capacity}</span>
            </div>
            <div class="h-1.5 w-full rounded bg-white/10">
                <div class="h-full rounded bg-secondary" style="width: {fill}%" data-testid="life-capacity-bar"></div>
            </div>
            <div class="flex justify-between" data-testid="life-waters">
                <span>{$LL.mapEditor.life.dashboard.waters()}</span>
                <span>{totals.populatedBodies} / {totals.habitableBodies}</span>
            </div>
        {/if}

        <span class="mt-2 text-xs uppercase text-white/50">{$LL.mapEditor.life.dashboard.history()}</span>
        <div
            class="flex flex-wrap gap-x-3 gap-y-1 text-xs"
            role="radiogroup"
            aria-label={$LL.mapEditor.life.dashboard.history()}
        >
            {#each RANGES as name (name)}
                <label class="m-0 flex cursor-pointer items-center gap-1">
                    <input
                        type="radio"
                        class="m-0"
                        name="life-history-range"
                        value={name}
                        bind:group={chosen}
                        data-testid="life-range-{name}"
                    />
                    {$LL.mapEditor.life.dashboard.range[name]()}
                </label>
            {/each}
        </div>
        <div class="flex justify-between text-xs">
            <span class="text-[#60a5fa]" data-testid="life-history-prey-max"
                >{$LL.mapEditor.life.dashboard.historyPrey({ max: maxPrey })}</span
            >
            <span class="text-[#fb923c]" data-testid="life-history-predators-max"
                >{$LL.mapEditor.life.dashboard.historyPredators({ max: maxPredators })}</span
            >
        </div>
        <svg
            viewBox="0 -2 {CHART_WIDTH} {CHART_HEIGHT + 4}"
            class="w-full rounded bg-white/5"
            aria-hidden="true"
            data-testid="life-history"
        >
            <!-- The scale: nothing, half and the largest value. -->
            {#each [0, 0.5, 1] as level (level)}
                <line
                    x1="0"
                    x2={CHART_WIDTH}
                    y1={CHART_HEIGHT * (1 - level / HEADROOM)}
                    y2={CHART_HEIGHT * (1 - level / HEADROOM)}
                    stroke="white"
                    stroke-opacity="0.12"
                    stroke-width="1"
                />
            {/each}
            <polyline
                fill="none"
                stroke="#60a5fa"
                stroke-width="2"
                stroke-linejoin="round"
                points={chartPoints(history, "prey", maxPrey * HEADROOM, CHART_WIDTH, CHART_HEIGHT, chartWindow)}
            />
            <polyline
                fill="none"
                stroke="#fb923c"
                stroke-width="2"
                stroke-linejoin="round"
                points={chartPoints(
                    history,
                    "predators",
                    maxPredators * HEADROOM,
                    CHART_WIDTH,
                    CHART_HEIGHT,
                    chartWindow,
                )}
            />
        </svg>
        <div class="flex justify-between text-xs text-white/50">
            <span data-testid="life-history-span"
                >{$LL.mapEditor.life.dashboard.ago({ duration: formatDuration(span) })}</span
            >
            <span>{$LL.mapEditor.life.dashboard.now()}</span>
        </div>

        {#if totals}
            <div class="mt-2 grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-0.5">
                <span></span>
                <span class="text-right text-xs uppercase text-white/50"
                    >{$LL.mapEditor.life.dashboard.lastMinute()}</span
                >
                <span class="text-right text-xs uppercase text-white/50"
                    >{$LL.mapEditor.life.dashboard.sinceStart()}</span
                >
                {#each EVENTS as event (event)}
                    <span>{$LL.mapEditor.life.dashboard[event]()}</span>
                    <span class="text-right" data-testid="life-minute-{event}">{stats.lastMinute[event]}</span>
                    <span class="text-right" data-testid="life-total-{event}">{totals[event]}</span>
                {/each}
                {#if $fishingCaughtStore}
                    <span>{$LL.mapEditor.life.dashboard.fished()}</span>
                    <span class="text-right" data-testid="life-minute-fished">{$fishingCaughtStore.lastMinute}</span>
                    <span class="text-right" data-testid="life-total-fished">{$fishingCaughtStore.total}</span>
                {/if}
            </div>
            <span class="text-right text-xs text-white/50" data-testid="life-since">
                {$LL.mapEditor.life.dashboard.since({
                    duration: formatDuration(Math.max(0, (Date.now() - totals.since) / 1000)),
                })}
            </span>
        {/if}
    </div>
{/if}
