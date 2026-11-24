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
    import { IconClock, IconFish, IconTrophy } from "@wa-icons";

    /** The last half minute of a contest: the timer turns red. */
    const HURRY_MS = 30_000;

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
    <div class="fishing-panel pointer-events-auto w-60" aria-live="polite" data-testid="fishing-contest">
        <div class="fishing-head">
            <span class="fishing-badge" aria-hidden="true">
                {#if contest.finished}<IconTrophy font-size="16" />{:else}<IconFish font-size="16" />{/if}
            </span>
            <span class="min-w-0 flex-1 truncate">{contest.finished ? texts.finished() : texts.title()}</span>
            {#if !contest.finished}
                <span
                    class="fishing-timer"
                    class:hurry={contest.endsAt - now <= HURRY_MS}
                    data-testid="fishing-contest-remaining"
                    ><IconClock font-size="12" />{formatRemaining(contest.endsAt - now)}</span
                >
            {/if}
        </div>
        {#if !contest.finished}
            <div class="fishing-sub">{texts.startedBy({ name: contest.hostName })}</div>
        {/if}
        {#if rows.length === 0}
            <div class="fishing-empty" data-testid="fishing-contest-empty">
                {contest.finished ? texts.nobody() : texts.empty()}
            </div>
        {:else}
            <ol class="fishing-rows">
                {#each rows as row (row.rank)}
                    <li
                        class="fishing-row"
                        class:own={row.own}
                        aria-current={row.own ? "true" : undefined}
                        data-testid="fishing-contest-row"
                    >
                        <span class="fishing-rank rank-{row.rank}">{row.rank}</span>
                        <span class="min-w-0 flex-1 truncate">{row.name}</span>
                        <span class="flex flex-col items-end leading-4">
                            <span class="fishing-weight"
                                >{texts.weight({ weight: formatKilograms(row.totalGrams, $locale) })}</span
                            >
                            <span class="fishing-best">({formatKilograms(row.bestGrams, $locale)})</span>
                        </span>
                    </li>
                {/each}
            </ol>
        {/if}
        {#if biggest}
            <div class="fishing-biggest" data-testid="fishing-contest-biggest">
                {texts.biggest({ weight: formatKilograms(biggest.grams, $locale), name: biggest.name })}
            </div>
        {/if}
        {#if contest.finished}
            <button
                type="button"
                class="fishing-key"
                data-testid="fishing-contest-close"
                onclick={() => fishingContestStore.set(undefined)}>{texts.close()}</button
            >
        {:else if !$rodEquippedStore}
            <button type="button" class="fishing-key primary" data-testid="fishing-contest-join" onclick={join}
                >{texts.join()}</button
            >
        {/if}
    </div>
{:else if $fishingContestSetupStore}
    <div class="fishing-panel pointer-events-auto w-60" data-testid="fishing-contest-setup">
        <div class="fishing-head">
            <span class="fishing-badge" aria-hidden="true"><IconFish font-size="16" /></span>
            <span class="min-w-0 flex-1 truncate">{texts.title()}</span>
        </div>
        <div class="fishing-sub">{texts.choose()}</div>
        <div class="mt-2 flex gap-2">
            {#each FISHING_CONTEST_MINUTES as minutes (minutes)}
                <button
                    type="button"
                    class="fishing-key primary flex-1"
                    data-testid="fishing-contest-start-{minutes}"
                    onclick={() => start(minutes)}>{texts.minutes({ minutes })}</button
                >
            {/each}
        </div>
        <button
            type="button"
            class="fishing-key"
            data-testid="fishing-contest-cancel"
            onclick={() => fishingContestSetupStore.set(false)}>{texts.cancel()}</button
        >
    </div>
{/if}
