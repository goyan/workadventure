<script lang="ts">
    import { KaraokeMode } from "@workadventure/map-editor";
    import { LL } from "../../../i18n/i18n-svelte";
    import { selectedKaraokeRoomStore, karaokeStatesStore } from "../../Karaoke/JamKaraoke";
    import { listeningByUserUuidStore } from "../../Spotify/SpotifyListeningDirectory";
    import { jukeboxQueuesStore } from "../../Spotify/HomeJam";
    import { LyricsTrackSchema } from "../../../common/Lyrics";
    import { spotifyTrackUri } from "../../../common/SpotifyListening";
    import { isLocalUser, ownJamLinkSaveStore, replaceOwnJamLink } from "../../ListeningZone/ListeningZoneController";
    import { openSpotifySettings } from "../../Stores/MenuStore";
    import KaraokePanel from "./KaraokePanel.svelte";
    import JamAudience from "./JamAudience.svelte";
    import KaraokeGame from "./KaraokeGame.svelte";
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
</script>

{#if room}
    {#key room.jam.hostUuid}
        <KaraokePanel
            {room}
            {playback}
            mine={isLocalUser(room.jam.hostUuid)}
            onopensettings={openSpotifySettings}
            onreplacelink={(url) => {
                replaceOwnJamLink(url).catch((error) => console.error("Cannot replace the Jam link", error));
            }}
            linkSave={$ownJamLinkSaveStore}
            onclose={() => selectedKaraokeRoomStore.set(undefined)}
        >
            {#snippet audience()}<JamAudience {room} />{/snippet}
            {#snippet stage()}
                <div
                    class="flex gap-1 rounded-full bg-white/5 p-1"
                    role="group"
                    aria-label={$LL.spotify.karaoke.title()}
                >
                    {#each [KaraokeMode.Listen, KaraokeMode.Game] as choice (choice)}
                        <button
                            type="button"
                            aria-pressed={mode === choice}
                            onclick={() => {
                                mode = choice;
                            }}
                            data-testid={`karaoke-mode-${choice}`}
                            class="flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-1 text-xs font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-white {mode ===
                            choice
                                ? 'bg-[var(--jam-accent,#1ed760)] text-contrast'
                                : 'text-white/70 hover:bg-white/10'}"
                        >
                            {#if choice === KaraokeMode.Listen}<IconHeadphones
                                    font-size="14"
                                />{$LL.spotify.karaoke.game.listen()}
                            {:else}<IconMicrophone font-size="14" />{$LL.spotify.karaoke.game.game()}{/if}
                        </button>
                    {/each}
                </div>
                {#if mode === KaraokeMode.Game}<div class="mt-2">
                        <KaraokeGame {room} mine={isLocalUser(room.jam.hostUuid)} />
                    </div>{/if}
            {/snippet}
        </KaraokePanel>
    {/key}
{/if}
