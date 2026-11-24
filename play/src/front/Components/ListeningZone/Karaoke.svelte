<script lang="ts">
    import { KaraokeMode } from "@workadventure/map-editor";
    import { untrack } from "svelte";
    import { LL } from "../../../i18n/i18n-svelte";
    import { selectedKaraokeRoomStore, karaokeStatesStore } from "../../Karaoke/JamKaraoke";
    import { listeningByUserUuidStore } from "../../Spotify/SpotifyListeningDirectory";
    import { jukeboxQueuesStore } from "../../Spotify/HomeJam";
    import { LyricsTrackSchema } from "../../../common/Lyrics";
    import { spotifyTrackUri } from "../../../common/SpotifyListening";
    import { isLocalUser, ownJamLinkSaveStore, replaceOwnJamLink } from "../../ListeningZone/ListeningZoneController";
    import { openSpotifySettings } from "../../Stores/MenuStore";
    import type { LyricLine } from "../../Karaoke/Lrc";
    import { lyricsRecordingKey } from "../../../common/Lyrics";
    import { karaokeStagesStore, setKaraokeLyrics } from "../../Karaoke/KaraokeStage";
    import type { DesktopSpotifyAnalysis } from "../../Interfaces/DesktopAppInterfaces";
    import KaraokePanel from "./KaraokePanel.svelte";
    import JamAudience from "./JamAudience.svelte";
    import KaraokeGame from "./KaraokeGame.svelte";
    import KaraokeShow from "./KaraokeShow.svelte";
    import { IconHeadphones, IconMicrophone } from "@wa-icons";

    let mode = $state(KaraokeMode.Listen);
    let room = $derived($selectedKaraokeRoomStore);
    let host = $derived(room ? $listeningByUserUuidStore.get(room.jam.hostUuid) : undefined);
    let queue = $derived(room ? $jukeboxQueuesStore.get(room.jam.hostUuid) : undefined);
    let fallbackTrack = $derived(
        LyricsTrackSchema.safeParse({
            title: host?.trackTitle,
            artist: host?.artistName,
            album: host?.albumName,
            uri: host ? spotifyTrackUri(host.trackUrl) : undefined,
        }),
    );
    // Existing metadata also work with a host who has not yet loaded the new front.
    let playback = $derived(
        (room ? $karaokeStatesStore.get(room.jam.hostUuid) : undefined) ?? {
            track: fallbackTrack.success ? fallbackTrack.data : null,
            next: queue?.tracks[0] ?? queue?.upcoming[0] ?? null,
            playing: fallbackTrack.success,
            positionMs: host?.positionMs ?? 0,
            positionAt: host?.positionAt ?? 0,
        },
    );
    /** Only the host's desktop app reads Spotify: one subscription, kept while the karaoke is open, in both modes. */
    let analysis = $state<DesktopSpotifyAnalysis | null>(null);
    let hostUuid = $derived(room?.jam.hostUuid);
    $effect(() => {
        if (!hostUuid || !isLocalUser(hostUuid)) return;
        return window.WAD?.watchSpotifyAnalysis?.((received) => {
            analysis = received;
        });
    });
    $effect(() => {
        const current = room;
        const track = playback.track;
        const lyrics = analysis?.lyrics;
        if (!current || !isLocalUser(current.jam.hostUuid) || !track?.uri || analysis?.uri !== track.uri) return;
        if (!lyrics?.length) return;
        const key = lyricsRecordingKey(track);
        if ($karaokeStagesStore.get(current.jam.hostUuid)?.lyrics?.recordingKey === key) return;
        untrack(() => setKaraokeLyrics(current, { recordingKey: key, lines: lyrics }));
    });

    /** A song without karaoke takes the game back to listening, once its lyrics had time to arrive. */
    let leaveGameTimer: ReturnType<typeof setTimeout> | undefined;
    function playableChanged(playable: boolean | undefined): void {
        clearTimeout(leaveGameTimer);
        if (playable !== false) return;
        leaveGameTimer = setTimeout(() => {
            if (mode === KaraokeMode.Game) mode = KaraokeMode.Listen;
        }, 2500);
    }
    $effect(() => () => clearTimeout(leaveGameTimer));
</script>

{#if room}
    {#key room.jam.hostUuid}
        <KaraokePanel
            {room}
            {playback}
            game={mode === KaraokeMode.Game}
            onplayable={playableChanged}
            artworkUrl={host?.artworkUrl || undefined}
            mine={isLocalUser(room.jam.hostUuid)}
            onopensettings={openSpotifySettings}
            onreplacelink={(url) => {
                replaceOwnJamLink(url).catch((error) => console.error("Cannot replace the Jam link", error));
            }}
            linkSave={$ownJamLinkSaveStore}
            onclose={() => selectedKaraokeRoomStore.set(undefined)}
        >
            {#snippet audience()}<JamAudience {room} />{/snippet}
            {#snippet show(
                playable: boolean | undefined,
                lines: readonly LyricLine[],
            )}{#if mode === KaraokeMode.Game}<KaraokeShow
                        {room}
                        {playback}
                        {playable}
                        {lines}
                        {analysis}
                    />{/if}{/snippet}
            {#snippet stage(playable: boolean | undefined)}
                <div
                    class="flex gap-1 rounded-full bg-white/5 p-1"
                    role="group"
                    aria-label={$LL.spotify.karaoke.title()}
                >
                    {#each [KaraokeMode.Listen, KaraokeMode.Game] as choice (choice)}
                        <button
                            type="button"
                            aria-pressed={mode === choice}
                            disabled={choice === KaraokeMode.Game && mode !== KaraokeMode.Game && playable !== true}
                            title={choice === KaraokeMode.Game && playable === false
                                ? $LL.spotify.karaoke.game.unavailable()
                                : undefined}
                            onclick={() => {
                                mode = choice;
                            }}
                            data-testid={`karaoke-mode-${choice}`}
                            class="flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-1 text-xs font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-white {mode ===
                            choice
                                ? 'bg-[var(--jam-accent,#1ed760)] text-contrast'
                                : 'text-white/70 hover:bg-white/10'} disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                        >
                            {#if choice === KaraokeMode.Listen}<IconHeadphones
                                    font-size="14"
                                />{$LL.spotify.karaoke.game.listen()}
                            {:else}<IconMicrophone font-size="14" />{$LL.spotify.karaoke.game.game()}<span
                                    class="karaoke-beta-badge"
                                    title={$LL.spotify.karaoke.game.betaNote()}>{$LL.spotify.karaoke.game.beta()}</span
                                >{/if}
                        </button>
                    {/each}
                </div>
                {#if mode === KaraokeMode.Game}<div class="mt-2">
                        <KaraokeGame {room} {playback} mine={isLocalUser(room.jam.hostUuid)} />
                    </div>{/if}
            {/snippet}
        </KaraokePanel>
    {/key}
{/if}

<style>
    .karaoke-beta-badge {
        border-radius: 9999px;
        padding: 0 0.35rem;
        font-size: 0.6rem;
        font-weight: 900;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: #2a1a00;
        background: #ffd166;
    }
</style>
