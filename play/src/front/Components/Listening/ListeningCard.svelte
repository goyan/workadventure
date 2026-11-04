<script lang="ts">
    import type { SpotifyListening } from "@workadventure/messages";
    import { LL } from "../../../i18n/i18n-svelte";
    import {
        isPlayingTrack,
        listeningSourceOf,
        listenTooLinks,
        parseSpotifyContextUri,
        spotifyContextUrl,
        spotifyTrackUri,
    } from "../../../common/SpotifyListening";
    import { followedUserUuidStore, listenAlongAvailableStore } from "../../Spotify/ListeningFollower";
    import ListeningSourceIcon from "./ListeningSourceIcon.svelte";

    interface Props {
        listening: SpotifyListening | undefined;
        /** The user who listens: set to offer listening along, undefined on one's own card. */
        followableUserUuid?: string;
    }

    let { listening, followableUserUuid = undefined }: Props = $props();

    let playing = $derived(isPlayingTrack(listening) ? listening : undefined);
    let links = $derived(playing ? listenTooLinks(playing) : undefined);
    let context = $derived(playing ? parseSpotifyContextUri(playing.contextUri) : undefined);
    let contextUrl = $derived(playing ? spotifyContextUrl(playing.contextUri) : undefined);
    // The desktop app plays a Spotify track on the Spotify app of this computer: Apple Music tracks have no link.
    let followable = $derived(
        followableUserUuid !== undefined &&
            $listenAlongAvailableStore &&
            playing !== undefined &&
            spotifyTrackUri(playing.trackUrl) !== undefined,
    );
    let following = $derived(followableUserUuid !== undefined && $followedUserUuidStore === followableUserUuid);

    function toggleFollow(): void {
        followedUserUuidStore.set(following ? undefined : followableUserUuid);
    }
</script>

{#if playing && links}
    <!-- Fixed width: the menu sizes to its content, so a long title would widen it and every track change resize it.
         At a fixed width, the texts truncate instead. -->
    <div
        class="mx-auto mb-3 flex w-80 max-w-full gap-3 items-center rounded-lg bg-white/10 p-2 text-start"
        data-testid="listening-card"
    >
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
            {#if context && contextUrl}
                <a
                    href={contextUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="block truncate text-xs text-white/75 hover:underline"
                    data-testid="listening-context"
                >
                    {context.type === "album"
                        ? $LL.spotify.card.album({ name: playing.contextName || "?" })
                        : $LL.spotify.card.playlist({ name: playing.contextName || "?" })}
                </a>
            {/if}
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
            {#if followable || following}
                <button
                    type="button"
                    class="mt-2 rounded-md border border-[#1ed760] px-2 py-1 text-xs font-bold text-[#1ed760] hover:bg-[#1ed760]/10"
                    onclick={toggleFollow}
                    data-testid="listen-along"
                >
                    {following ? $LL.spotify.card.stopListeningAlong() : $LL.spotify.card.listenAlong()}
                </button>
            {/if}
        </div>
    </div>
{/if}
