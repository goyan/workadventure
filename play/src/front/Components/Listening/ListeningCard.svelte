<script lang="ts">
    import type { SpotifyListening } from "@workadventure/messages";
    import { LL } from "../../../i18n/i18n-svelte";
    import { isPlayingTrack, listeningSourceOf, listenTooLinks } from "../../../common/SpotifyListening";
    import ListeningSourceIcon from "./ListeningSourceIcon.svelte";

    interface Props {
        listening: SpotifyListening | undefined;
    }

    let { listening }: Props = $props();

    let playing = $derived(isPlayingTrack(listening) ? listening : undefined);
    let links = $derived(playing ? listenTooLinks(playing) : undefined);
</script>

{#if playing && links}
    <div class="mx-4 mb-3 flex gap-3 items-center rounded-lg bg-white/10 p-2 text-start" data-testid="listening-card">
        {#if playing.artworkUrl}
            <img
                src={playing.artworkUrl}
                alt={playing.albumName}
                class="w-16 h-16 shrink-0 rounded-md object-cover"
                referrerpolicy="no-referrer"
            />
        {:else}
            <div class="w-16 h-16 shrink-0 rounded-md bg-white/10 flex items-center justify-center">
                <ListeningSourceIcon source={listeningSourceOf(playing)} size="32" />
            </div>
        {/if}
        <div class="min-w-0 grow">
            <div class="flex items-center gap-1 text-xs text-white/60">
                <ListeningSourceIcon source={listeningSourceOf(playing)} size="14" />
                {$LL.spotify.card.listeningNow()}
            </div>
            <div class="truncate font-bold text-white">{playing.trackTitle}</div>
            <div class="truncate text-sm text-white/75">
                {playing.artistName}{playing.albumName ? ` — ${playing.albumName}` : ""}
            </div>
            <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span class="text-white/60">{$LL.spotify.card.listenToo()}</span>
                <a
                    href={links.spotify}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="flex items-center gap-1 text-[#1ed760] hover:underline"
                    data-testid="listen-too-spotify"
                >
                    <ListeningSourceIcon source="spotify" size="14" />Spotify
                </a>
                <a
                    href={links["apple-music"]}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="flex items-center gap-1 text-[#fa2d48] hover:underline"
                    data-testid="listen-too-apple-music"
                >
                    <ListeningSourceIcon source="apple-music" size="14" />Apple Music
                </a>
            </div>
        </div>
    </div>
{/if}
