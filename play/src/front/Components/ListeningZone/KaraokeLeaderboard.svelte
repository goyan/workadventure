<script lang="ts">
    import { untrack } from "svelte";
    import { LL } from "../../../i18n/i18n-svelte";
    import { karaokeLeaderboardsStore, requestKaraokeLeaderboard } from "../../Karaoke/KaraokeStage";
    import { KARAOKE_MEDALS } from "../../Karaoke/KaraokeShow";

    let {
        recordingKey,
        highlight,
        limit = 11,
    }: { recordingKey: string; highlight?: string; limit?: number } = $props();

    let board = $derived(recordingKey ? $karaokeLeaderboardsStore.get(recordingKey) : undefined);
    let leaders = $derived(board?.entries.slice(0, limit) ?? []);
    let record = $derived(board?.entries[0]);

    $effect(() => {
        const key = recordingKey;
        if (key) untrack(() => requestKaraokeLeaderboard(key));
    });
</script>

{#if record}
    <section
        class="w-full text-xs"
        aria-label={$LL.spotify.karaoke.show.leaderboard()}
        data-testid="karaoke-leaderboard"
    >
        <div class="karaoke-record">
            <span class="text-xl" aria-hidden="true">👑</span>
            <div class="min-w-0 flex-1 text-start">
                <span class="block text-[10px] font-bold uppercase tracking-widest text-[#ffd166]"
                    >{$LL.spotify.karaoke.show.record()}</span
                >
                <strong dir="auto" class="block truncate text-sm">{record.name}</strong>
            </div>
            <b class="shrink-0 text-base tabular-nums text-[#ffd166]">{record.score}</b>
        </div>
        <p class="m-0 mb-1 mt-2 font-bold uppercase tracking-wider text-[var(--jam-accent,#1ed760)]">
            🏆 {$LL.spotify.karaoke.show.leaderboard()}
        </p>
        <ol class="m-0 flex list-none flex-col gap-1 p-0">
            {#each leaders as leader, index (leader.singerUuid)}
                <li
                    class="flex items-center gap-2 rounded-lg px-2 py-1 {leader.singerUuid === highlight
                        ? 'bg-[var(--jam-accent,#1ed760)]/25 font-bold'
                        : 'bg-white/5'}"
                >
                    <span class="w-5 shrink-0 text-center">{KARAOKE_MEDALS[index] ?? index + 1}</span>
                    <span dir="auto" class="min-w-0 flex-1 truncate text-start">{leader.name}</span>
                    <span class="shrink-0 tabular-nums text-white/70">{leader.accuracy}%</span>
                    <b class="w-12 shrink-0 text-end tabular-nums">{leader.score}</b>
                </li>
            {/each}
        </ol>
    </section>
{/if}

<style>
    .karaoke-record {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        border-radius: 0.75rem;
        padding: 0.5rem 0.75rem;
        background: linear-gradient(110deg, rgb(255 209 102 / 0.22), rgb(245 166 35 / 0.08));
        box-shadow: inset 0 0 0 1px rgb(255 209 102 / 0.45);
    }
</style>
