<script lang="ts">
    import type { SpotifyListening } from "@workadventure/messages";
    import type { Readable } from "svelte/store";
    import { LL } from "../../../../i18n/i18n-svelte";
    import { isInJam, listeningSourceOf, listenTooLinks } from "../../../../common/SpotifyListening";
    import ListeningSourceIcon from "../../../Components/Listening/ListeningSourceIcon.svelte";
    import { jamLabelOf, shownTrackOf } from "../../../ListeningZone/JamTitle";
    import { allJamRoomsStore } from "../../../ListeningZone/ListeningZoneController";
    import { listeningByUserUuidStore } from "../../../Spotify/SpotifyListeningDirectory";

    interface Props {
        listening: Readable<SpotifyListening | undefined>;
    }

    let { listening }: Props = $props();

    // A guest who listens to the streamed music plays nothing themselves: the track shown is their host's.
    let playing = $derived(shownTrackOf($listening, $listeningByUserUuidStore));
    let jam = $derived(isInJam($listening) ? $listening : undefined);
    // The title of the Jam, which the listening does not carry, comes from the rooms of the map.
    let jamLabel = $derived(jam ? jamLabelOf($allJamRoomsStore, jam) : "");
    let source = $derived(playing ? listeningSourceOf(playing) : "spotify");
    // The track on the service it plays on: its page on Spotify, a search on Apple Music (no public link there).
    let href = $derived(playing ? listenTooLinks(playing)[source] : undefined);
</script>

{#if playing || jam}
    <div
        class="flex items-center gap-1 min-w-0 text-xs {source === 'apple-music' ? 'text-[#fa2d48]' : 'text-[#1ed760]'}"
        data-testid="spotify-listening"
    >
        {#if jam}
            <span aria-hidden="true" class="shrink-0">🎧</span>
        {:else}
            <ListeningSourceIcon {source} size="12" />
        {/if}
        {#if playing}
            {#if href}
                <a
                    {href}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={source === "apple-music"
                        ? $LL.spotify.userList.listenOnAppleMusic()
                        : $LL.spotify.userList.listenOnSpotify()}
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
                    area: jamLabel || $LL.spotify.listeningZone.defaultName(),
                })}
            </span>
        {/if}
    </div>
{/if}
