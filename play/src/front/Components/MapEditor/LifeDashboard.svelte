<script lang="ts">
    import { LL } from "../../../i18n/i18n-svelte";
    import { formatDuration } from "../../Phaser/Game/Life/LifeDurations";
    import { aquaticLifeStatsStore } from "../../Stores/TerrainEditorStore";

    /** The history is drawn in a box of this size; each line has its own scale. */
    const CHART_WIDTH = 240;
    const CHART_HEIGHT = 48;
    const EVENTS = ["births", "arrivals", "diedOfAge", "eaten", "diedDry"] as const;

    let stats = $derived($aquaticLifeStatsStore);
    let totals = $derived(stats?.totals);
    let fill = $derived(
        stats && totals && totals.capacity > 0 ? Math.min(100, Math.round((stats.prey / totals.capacity) * 100)) : 0,
    );
    let maxPrey = $derived(Math.max(1, ...(stats?.history ?? []).map((sample) => sample.prey)));
    let maxPredators = $derived(Math.max(1, ...(stats?.history ?? []).map((sample) => sample.predators)));

    /** The points of a line of the history: oldest on the left, its largest value at the top. */
    function pointsOf(values: number[], max: number): string {
        const step = values.length > 1 ? CHART_WIDTH / (values.length - 1) : 0;
        return values
            .map((value, index) => `${Math.round(index * step)},${Math.round(CHART_HEIGHT * (1 - value / max))}`)
            .join(" ");
    }

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

        <span class="mt-2 text-xs text-white/50">{$LL.mapEditor.life.dashboard.history()}</span>
        <svg
            viewBox="0 -2 {CHART_WIDTH} {CHART_HEIGHT + 4}"
            class="w-full rounded bg-white/5"
            preserveAspectRatio="none"
            aria-hidden="true"
            data-testid="life-history"
        >
            <polyline
                fill="none"
                stroke="#60a5fa"
                stroke-width="1.5"
                points={pointsOf(
                    stats.history.map((sample) => sample.prey),
                    maxPrey,
                )}
            />
            <polyline
                fill="none"
                stroke="#fb923c"
                stroke-width="1.5"
                points={pointsOf(
                    stats.history.map((sample) => sample.predators),
                    maxPredators,
                )}
            />
        </svg>
        <div class="flex justify-between text-xs">
            <span class="text-[#60a5fa]">{$LL.mapEditor.life.dashboard.historyPrey({ max: maxPrey })}</span>
            <span class="text-[#fb923c]">{$LL.mapEditor.life.dashboard.historyPredators({ max: maxPredators })}</span>
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
            </div>
            <span class="text-right text-xs text-white/50" data-testid="life-since">
                {$LL.mapEditor.life.dashboard.since({
                    duration: formatDuration(Math.max(0, (Date.now() - totals.since) / 1000)),
                })}
            </span>
        {/if}
    </div>
{/if}
