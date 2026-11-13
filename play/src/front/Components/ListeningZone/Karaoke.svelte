<script lang="ts">
    import { selectedKaraokeRoomStore, karaokeStatesStore } from "../../Karaoke/JamKaraoke";
    import { listeningByUserUuidStore } from "../../Spotify/SpotifyListeningDirectory";
    import { jukeboxQueuesStore } from "../../Spotify/HomeJam";
    import { LyricsTrackSchema } from "../../../common/Lyrics";
    import { spotifyTrackUri } from "../../../common/SpotifyListening";
    import { isLocalUser } from "../../ListeningZone/ListeningZoneController";
    import { jamDrawer } from "../../ListeningZone/JamDrawerStore";
    import { openSpotifySettings } from "../../Stores/MenuStore";
    import KaraokePanel from "./KaraokePanel.svelte";

    let room = $derived($selectedKaraokeRoomStore);
    const drawerOpen = jamDrawer.open;

    /** The host pastes the link of a new Jam on their room's card, in the Jam drawer. */
    function openJams(): void {
        if (!$drawerOpen) jamDrawer.toggle();
    }
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
            onopenjams={openJams}
            onclose={() => selectedKaraokeRoomStore.set(undefined)}
        />
    {/key}
{/if}
