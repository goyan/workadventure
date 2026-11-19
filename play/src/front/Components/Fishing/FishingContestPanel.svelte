<script lang="ts">
    import { FISHING_CONTEST_MINUTES } from "@workadventure/map-editor";
    import { LL, locale } from "../../../i18n/i18n-svelte";
    import {
        biggestCatch,
        FISHING_PODIUM_ROWS,
        FISHING_RANKING_ROWS,
        formatRemaining,
        shownRows,
    } from "../../Phaser/Game/Fishing/FishingContestView";
    import { formatKilograms } from "../../Phaser/Game/Fishing/FishingProtocol";
    import { fishingContestSetupStore, fishingContestStore, rodEquippedStore } from "../../Stores/FishingStore";

    interface Props {
        /** Starts a contest of that many minutes. */
        start: (minutes: number) => void;
        /** Takes the fishing rod in hand. */
        join: () => void;
    }

    let { start, join }: Props = $props();

    let now = $state(Date.now());
    const contest = $derived($fishingContestStore);
    const texts = $derived($LL.actionbar.rod.contest);
    const rows = $derived(
        contest ? shownRows(contest.rows, contest.finished ? FISHING_PODIUM_ROWS : FISHING_RANKING_ROWS) : [],
    );
    const biggest = $derived(contest?.finished ? biggestCatch(contest.rows) : undefined);

    // The time left is read on the clock of this browser, once a second while a contest runs.
    $effect(() => {
        if (!contest || contest.finished) return;
        now = Date.now();
        const timer = setInterval(() => (now = Date.now()), 1000);
        return () => clearInterval(timer);
    });
</script>

<!-- The fishing contest of the room under the clock: its length to choose, its ranking, then its podium. -->
{#if contest}
    <div
        class="pointer-events-auto w-56 rounded-lg bg-contrast/80 px-3 py-2 text-xs leading-5 text-white backdrop-blur"
        aria-live="polite"
        data-testid="fishing-contest"
    >
        <div class="flex items-baseline justify-between gap-2 font-bold">
            <span>{contest.finished ? texts.finished() : texts.title()}</span>
            {#if !contest.finished}
                <span class="tabular-nums" data-testid="fishing-contest-remaining"
                    >{formatRemaining(contest.endsAt - now)}</span
                >
            {/if}
        </div>
        {#if !contest.finished}
            <div class="text-white/60">{texts.startedBy({ name: contest.hostName })}</div>
        {/if}
        {#if rows.length === 0}
            <div class="text-white/80" data-testid="fishing-contest-empty">
                {contest.finished ? texts.nobody() : texts.empty()}
            </div>
        {:else}
            <ol class="m-0 list-none p-0">
                {#each rows as row (row.rank)}
                    <li
                        class="flex items-baseline gap-1"
                        class:font-bold={row.own}
                        aria-current={row.own ? "true" : undefined}
                        data-testid="fishing-contest-row"
                    >
                        <span class="w-4 text-right tabular-nums text-white/60">{row.rank}.</span>
                        <span class="min-w-0 flex-1 truncate">{row.name}</span>
                        <span class="tabular-nums"
                            >{texts.weight({ weight: formatKilograms(row.totalGrams, $locale) })}</span
                        >
                        <span class="tabular-nums text-white/60">({formatKilograms(row.bestGrams, $locale)})</span>
                    </li>
                {/each}
            </ol>
        {/if}
        {#if biggest}
            <div class="mt-1 text-white/80" data-testid="fishing-contest-biggest">
                {texts.biggest({ weight: formatKilograms(biggest.grams, $locale), name: biggest.name })}
            </div>
        {/if}
        {#if contest.finished}
            <button
                type="button"
                class="mt-1 w-full rounded bg-white/15 px-2 py-0.5 hover:bg-white/25"
                data-testid="fishing-contest-close"
                onclick={() => fishingContestStore.set(undefined)}>{texts.close()}</button
            >
        {:else if !$rodEquippedStore}
            <button
                type="button"
                class="mt-1 w-full rounded bg-secondary px-2 py-0.5 font-bold hover:bg-secondary-600"
                data-testid="fishing-contest-join"
                onclick={join}>{texts.join()}</button
            >
        {/if}
    </div>
{:else if $fishingContestSetupStore}
    <div
        class="pointer-events-auto w-56 rounded-lg bg-contrast/80 px-3 py-2 text-xs leading-5 text-white backdrop-blur"
        data-testid="fishing-contest-setup"
    >
        <div class="font-bold">{texts.title()}</div>
        <div class="text-white/60">{texts.choose()}</div>
        <div class="mt-1 flex gap-1">
            {#each FISHING_CONTEST_MINUTES as minutes (minutes)}
                <button
                    type="button"
                    class="flex-1 rounded bg-secondary px-1 py-0.5 font-bold hover:bg-secondary-600"
                    data-testid="fishing-contest-start-{minutes}"
                    onclick={() => start(minutes)}>{texts.minutes({ minutes })}</button
                >
            {/each}
        </div>
        <button
            type="button"
            class="mt-1 w-full rounded bg-white/15 px-2 py-0.5 hover:bg-white/25"
            data-testid="fishing-contest-cancel"
            onclick={() => fishingContestSetupStore.set(false)}>{texts.cancel()}</button
        >
    </div>
{/if}
