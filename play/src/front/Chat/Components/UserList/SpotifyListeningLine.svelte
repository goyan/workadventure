<script lang="ts">
    import type { SpotifyListening } from "@workadventure/messages";
    import type { Readable } from "svelte/store";
    import { LL } from "../../../../i18n/i18n-svelte";
    import { isInJam, isPlayingTrack } from "../../../../common/SpotifyListening";

    interface Props {
        listening: Readable<SpotifyListening | undefined>;
    }

    let { listening }: Props = $props();

    let playing = $derived(isPlayingTrack($listening) ? $listening : undefined);
    let jam = $derived(isInJam($listening) ? $listening : undefined);
</script>

{#if playing || jam}
    <div class="flex items-center gap-1 min-w-0 text-xs text-[#1ed760]" data-testid="spotify-listening">
        <span aria-hidden="true" class="shrink-0">{jam ? "🎧" : "♫"}</span>
        {#if playing}
            {#if playing.trackUrl}
                <a
                    href={playing.trackUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={$LL.spotify.userList.listenOnSpotify()}
                    class="truncate text-inherit hover:underline"
                    onclick={(event) => event.stopPropagation()}
                >
                    {playing.artistName} — {playing.trackTitle}
                </a>
            {:else}
                <span class="truncate">{playing.artistName} — {playing.trackTitle}</span>
            {/if}
        {/if}
        {#if jam}
            <span class="shrink-0 opacity-75">
                {playing ? "· " : ""}{$LL.spotify.userList.jam({
                    area: jam.jamAreaName || $LL.spotify.listeningZone.defaultName(),
                })}
            </span>
        {/if}
    </div>
{/if}
