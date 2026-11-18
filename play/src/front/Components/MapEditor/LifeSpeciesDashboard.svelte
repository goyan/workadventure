<script lang="ts">
    import { LIFE_RANGES } from "@workadventure/map-editor";
    import type { LifeRangeName } from "@workadventure/map-editor";
    import { LL } from "../../../i18n/i18n-svelte";
    import { speciesChart } from "../../Phaser/Game/Life/LifeSpeciesStats";
    import type { SpeciesRow } from "../../Phaser/Game/Life/LifeSpeciesStats";
    import { aquaticLifeSpeciesStore } from "../../Stores/TerrainEditorStore";

    /** The species by their number in the messages: their name in the translations, and the colour of their curve. */
    const SPECIES = [
        { name: "fish", colour: "#60a5fa" },
        { name: "dolphin", colour: "#fb923c" },
        { name: "antelope", colour: "#a3e635" },
        { name: "lion", colour: "#facc15" },
        { name: "tiger", colour: "#f87171" },
        { name: "gull", colour: "#e5e7eb" },
    ] as const;
    const EVENTS = ["arrivals", "births", "diedOfAge", "eaten", "starved", "diedDry"] as const;
    const CHART_WIDTH = 300;
    const CHART_HEIGHT = 110;
    const RANGES = [...LIFE_RANGES.map((range) => range.name), "all"] as const;

    let view = $derived($aquaticLifeSpeciesStore);
    let rows = $derived(view?.rows ?? []);
    let period = $state<"minute" | "total">("minute");
    let chosen = $state<LifeRangeName | "all">("5min");
    let hidden = $state<number[]>([]);

    const nameOf = (species: number): string => {
        const known = SPECIES.at(species);
        return known ? $LL.mapEditor.life.species.name[known.name]() : `#${species}`;
    };
    const colourOf = (species: number): string => SPECIES.at(species)?.colour ?? "#ffffff";
    const eventsOf = (row: SpeciesRow) => (period === "minute" ? row.lastMinute : row);
    const clock = (at: number): string =>
        new Date(at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

    /** Who ate whom: a line for each predator and each prey it ate at least once. */
    let meals = $derived(
        rows.flatMap((row) =>
            row.meals.map((meal) => ({
                predator: row.species,
                prey: meal.species,
                total: meal.count,
                minute: row.lastMinute.meals.find((other) => other.species === meal.species)?.count ?? 0,
            })),
        ),
    );
    let range = $derived(LIFE_RANGES.find((candidate) => candidate.name === chosen));
    let history = $derived((chosen === "all" ? view?.history : view?.ranges[chosen]) ?? []);
    let last = $derived(history.length > 0 ? history[history.length - 1].at : 0);
    let chartWindow = $derived(range ? { from: last - range.spanMs, to: last } : undefined);
    let curves = $derived(
        speciesChart(
            history,
            rows.map((row) => row.species).filter((species) => !hidden.includes(species)),
            CHART_WIDTH,
            CHART_HEIGHT,
            chartWindow,
        ),
    );
    const toggle = (species: number): void => {
        hidden = hidden.includes(species) ? hidden.filter((other) => other !== species) : [...hidden, species];
    };
</script>

{#if rows.length > 0}
    <div class="flex flex-col gap-1 text-sm text-white" data-testid="life-species">
        {#each rows as row (row.species)}
            {#if row.extinctSince !== undefined}
                <p
                    class="m-0 rounded bg-danger/30 px-2 py-1 text-xs"
                    role="status"
                    data-testid="life-extinct-{row.species}"
                >
                    {$LL.mapEditor.life.species.extinct({ name: nameOf(row.species), time: clock(row.extinctSince) })}
                </p>
            {/if}
        {/each}

        <div class="flex items-center justify-between">
            <span class="text-xs uppercase text-white/50">{$LL.mapEditor.life.species.title()}</span>
            <div class="flex gap-3 text-xs" role="radiogroup" aria-label={$LL.mapEditor.life.species.title()}>
                <label class="m-0 flex cursor-pointer items-center gap-1">
                    <input
                        type="radio"
                        class="m-0"
                        name="life-species-period"
                        value="minute"
                        bind:group={period}
                        data-testid="life-species-period-minute"
                    />
                    {$LL.mapEditor.life.dashboard.lastMinute()}
                </label>
                <label class="m-0 flex cursor-pointer items-center gap-1">
                    <input
                        type="radio"
                        class="m-0"
                        name="life-species-period"
                        value="total"
                        bind:group={period}
                        data-testid="life-species-period-total"
                    />
                    {$LL.mapEditor.life.dashboard.sinceStart()}
                </label>
            </div>
        </div>
        <div class="overflow-x-auto">
            <table class="w-full border-collapse text-right">
                <thead>
                    <tr>
                        <th></th>
                        {#each rows as row (row.species)}
                            <th
                                class="px-1 text-xs font-bold"
                                style="color: {colourOf(row.species)}"
                                data-testid="life-species-{row.species}-name">{nameOf(row.species)}</th
                            >
                        {/each}
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <th class="text-left font-normal">{$LL.mapEditor.life.dashboard.males()}</th>
                        {#each rows as row (row.species)}
                            <td class="px-1" data-testid="life-species-{row.species}-males">{row.males}</td>
                        {/each}
                    </tr>
                    <tr>
                        <th class="text-left font-normal">{$LL.mapEditor.life.dashboard.females()}</th>
                        {#each rows as row (row.species)}
                            <td class="px-1" data-testid="life-species-{row.species}-females">{row.females}</td>
                        {/each}
                    </tr>
                    <tr>
                        <th class="text-left font-normal">{$LL.mapEditor.life.species.fill()}</th>
                        {#each rows as row (row.species)}
                            <td class="whitespace-nowrap px-1" data-testid="life-species-{row.species}-fill"
                                >{row.cap > 0 ? `${row.males + row.females} / ${row.cap}` : "—"}</td
                            >
                        {/each}
                    </tr>
                    {#each EVENTS as event (event)}
                        <tr>
                            <th class="text-left font-normal">{$LL.mapEditor.life.species.events[event]()}</th>
                            {#each rows as row (row.species)}
                                <td class="px-1" data-testid="life-species-{row.species}-{event}"
                                    >{eventsOf(row)[event]}</td
                                >
                            {/each}
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>

        {#if meals.length > 0}
            <span class="mt-2 text-xs uppercase text-white/50">{$LL.mapEditor.life.species.meals()}</span>
            <div class="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-0.5" data-testid="life-meals">
                <span></span>
                <span class="text-right text-xs uppercase text-white/50"
                    >{$LL.mapEditor.life.dashboard.lastMinute()}</span
                >
                <span class="text-right text-xs uppercase text-white/50"
                    >{$LL.mapEditor.life.dashboard.sinceStart()}</span
                >
                {#each meals as meal (`${meal.predator}-${meal.prey}`)}
                    <div class="contents" data-testid="life-meals-{meal.predator}-{meal.prey}">
                        <span>{nameOf(meal.predator)} → {nameOf(meal.prey)}</span>
                        <span class="text-right">{meal.minute}</span>
                        <span class="text-right">{meal.total}</span>
                    </div>
                {/each}
            </div>
        {/if}

        <span class="mt-2 text-xs uppercase text-white/50">{$LL.mapEditor.life.species.curves()}</span>
        <div
            class="flex flex-wrap gap-x-3 gap-y-1 text-xs"
            role="radiogroup"
            aria-label={$LL.mapEditor.life.species.curves()}
        >
            {#each RANGES as name (name)}
                <label class="m-0 flex cursor-pointer items-center gap-1">
                    <input
                        type="radio"
                        class="m-0"
                        name="life-species-range"
                        value={name}
                        bind:group={chosen}
                        data-testid="life-species-range-{name}"
                    />
                    {$LL.mapEditor.life.dashboard.range[name]()}
                </label>
            {/each}
        </div>
        <div class="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {#each rows as row (row.species)}
                <label class="m-0 flex cursor-pointer items-center gap-1" style="color: {colourOf(row.species)}">
                    <input
                        type="checkbox"
                        class="m-0"
                        checked={!hidden.includes(row.species)}
                        onchange={() => toggle(row.species)}
                        data-testid="life-curve-toggle-{row.species}"
                    />
                    {nameOf(row.species)}
                </label>
            {/each}
        </div>
        <svg
            viewBox="0 -2 {CHART_WIDTH} {CHART_HEIGHT + 4}"
            class="w-full rounded bg-white/5"
            aria-hidden="true"
            data-testid="life-species-curves"
        >
            {#each [0, 0.5, 1] as level (level)}
                <line
                    x1="0"
                    x2={CHART_WIDTH}
                    y1={CHART_HEIGHT * (1 - level)}
                    y2={CHART_HEIGHT * (1 - level)}
                    stroke="white"
                    stroke-opacity="0.12"
                    stroke-width="1"
                />
            {/each}
            {#each curves as curve (curve.species)}
                <polyline
                    fill="none"
                    stroke={colourOf(curve.species)}
                    stroke-width="2"
                    stroke-linejoin="round"
                    points={curve.points}
                    data-testid="life-species-curve-{curve.species}"
                />
            {/each}
        </svg>
    </div>
{/if}
