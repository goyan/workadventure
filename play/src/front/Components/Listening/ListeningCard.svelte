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
    import { listeningAlongCountStore } from "../../Spotify/SpotifyListeningDirectory";
    import ListeningSourceIcon from "./ListeningSourceIcon.svelte";

    interface Props {
        listening: SpotifyListening | undefined;
        /** The user who listens: set to offer listening along, undefined on one's own card. */
        followableUserUuid?: string;
        /** The user whose card it is, to show how many listen along with them. */
        userUuid?: string;
    }

    let { listening, followableUserUuid = undefined, userUuid = undefined }: Props = $props();
    let listeningAlongCount = $derived(userUuid ? ($listeningAlongCountStore.get(userUuid) ?? 0) : 0);

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
    <!-- Fills the menu, whose width is fixed: a long title is truncated instead of resizing it on every track. -->
    <div
        class="mx-4 mb-3 rounded-xl border border-white/10 bg-linear-to-br from-[#1ed760]/15 to-white/5 p-3 text-start"
        data-testid="listening-card"
    >
        <div class="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[#1ed760]">
            <ListeningSourceIcon source={listeningSourceOf(playing)} size="14" />
            {$LL.spotify.card.listeningNow()}
            {#if listeningAlongCount > 0}
                <span
                    class="ms-auto rounded-full bg-[#1ed760]/20 px-2 py-0.5 normal-case tracking-normal"
                    data-testid="listening-along-count"
                >
                    🎧 {$LL.spotify.card.listeningAlongCount({ count: listeningAlongCount })}
                </span>
            {/if}
        </div>
        <div class="flex items-center gap-3">
            {#if playing.artworkUrl}
                <img
                    src={playing.artworkUrl}
                    alt={playing.albumName}
                    class="h-16 w-16 shrink-0 rounded-lg object-cover shadow-lg"
                    referrerpolicy="no-referrer"
                />
            {:else}
                <div class="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-white/10">
                    <ListeningSourceIcon source={listeningSourceOf(playing)} size="32" />
                </div>
            {/if}
            <div class="min-w-0 flex-1">
                <div class="truncate font-bold text-white">{playing.trackTitle}</div>
                <div class="truncate text-sm text-white/70">
                    {playing.artistName}{playing.albumName ? ` — ${playing.albumName}` : ""}
                </div>
                {#if context && contextUrl}
                    <a
                        href={contextUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="block truncate text-xs text-white/60 hover:text-white hover:underline"
                        data-testid="listening-context"
                    >
                        {context.type === "album"
                            ? $LL.spotify.card.album({ name: playing.contextName || "?" })
                            : $LL.spotify.card.playlist({ name: playing.contextName || "?" })}
                    </a>
                {/if}
            </div>
        </div>
        <div class="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span class="text-white/50">{$LL.spotify.card.listenToo()}</span>
            <a
                href={links.spotify}
                target="_blank"
                rel="noopener noreferrer"
                class="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[#1ed760] hover:bg-white/20"
                data-testid="listen-too-spotify"
            >
                <ListeningSourceIcon source="spotify" size="12" />Spotify
            </a>
            <a
                href={links["apple-music"]}
                target="_blank"
                rel="noopener noreferrer"
                class="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[#fa2d48] hover:bg-white/20"
                data-testid="listen-too-apple-music"
            >
                <ListeningSourceIcon source="apple-music" size="12" />Apple Music
            </a>
        </div>
        {#if followable || following}
            <button
                type="button"
                class="mt-3 w-full rounded-full py-1.5 text-xs font-bold transition-colors {following
                    ? 'border border-[#1ed760] text-[#1ed760] hover:bg-[#1ed760]/10'
                    : 'bg-[#1ed760] text-black hover:bg-[#3be477]'}"
                onclick={toggleFollow}
                data-testid="listen-along"
            >
                {following ? $LL.spotify.card.stopListeningAlong() : $LL.spotify.card.listenAlong()}
            </button>
        {/if}
    </div>
{/if}
