<script lang="ts">
    import { SvelteSet } from "svelte/reactivity";
    import { isHomeJam, isLiveJam, listeningZoneJamKey } from "@workadventure/map-editor";
    import { LL } from "../../../i18n/i18n-svelte";
    import { isPlayingTrack, spotifyTrackUri } from "../../../common/SpotifyListening";
    import {
        allJamRoomsStore,
        isLocalUser,
        jamParticipantsCountStore,
        joinHomeJam,
        joinJam,
        leaveJam,
        localPlayerName,
        stopSharingJam,
        updateOwnRoom,
        type JamRoom,
    } from "../../ListeningZone/ListeningZoneController";
    import { joinedJamStore } from "../../ListeningZone/ListeningZoneStore";
    import { followedUserUuidStore, listenAlongAvailableStore } from "../../Spotify/ListeningFollower";
    import { listeningByUserUuidStore } from "../../Spotify/SpotifyListeningDirectory";
    import { playersStore } from "../../Stores/PlayersStore";
    import { lampEffectsEnabledStore } from "../../Stores/LampEffectsStore";
    import { jukeboxQueuesStore } from "../../Spotify/HomeJam";
    import { jamAudioSession } from "../../ListeningZone/GameJamAudioSession";
    import { jamMusicCapture } from "../../ListeningZone/JamMusicCapture";
    import { requestedMicrophoneDeviceIdStore } from "../../Stores/MediaStore";
    import { toggleKaraokeRoom } from "../../Karaoke/JamKaraoke";
    import Button from "../UI/Button.svelte";
    import JamAudioControls from "./JamAudioControls.svelte";
    import JukeboxPlaybackControls from "./JukeboxPlaybackControls.svelte";
    import LightEffectsToggle from "./LightEffectsToggle.svelte";
    import JukeboxQueue from "./JukeboxQueue.svelte";

    // A home Jam plays on the Spotify app of this computer, through the desktop app and the Spicetify extension.
    let canHomeJam = $derived($listenAlongAvailableStore);
    /** The Jukeboxes whose queue is shown, by host uuid. */
    const openQueues = new SvelteSet<string>();
    const jamMusicCaptureState = jamMusicCapture.state;

    /** Leaving a Jam, or closing one's own, ends its audio too: the music of the room must not outlive the room. */
    function endAudioOf(room: JamRoom): void {
        jamAudioSession
            .leave({ areaId: room.zone.areaId, propertyId: room.zone.propertyId, hostUuid: room.jam.hostUuid })
            .catch((error) => console.error("Cannot end the Jam audio", error));
    }

    function toggleQueue(hostUuid: string): void {
        if (!openQueues.delete(hostUuid)) openQueues.add(hostUuid);
    }

    /** Rooms opened before the session name was known have no name: the host's current name is shown instead. */
    function hostNameOf(hostUuid: string, savedName: string): string {
        if (savedName) return savedName;
        if (isLocalUser(hostUuid)) return localPlayerName() || "?";
        return [...$playersStore.values()].find((player) => player.userUuid === hostUuid)?.name || "?";
    }
</script>

{#each $allJamRoomsStore as room (listeningZoneJamKey(room.jam))}
    {@const jam = room.jam}
    {@const hostListening = $listeningByUserUuidStore.get(jam.hostUuid)}
    {@const hostTrack = isPlayingTrack(hostListening) ? hostListening : undefined}
    {@const home = isHomeJam(jam)}
    {@const live = isLiveJam(jam)}
    {@const following = $followedUserUuidStore === jam.hostUuid}
    {@const mine = isLocalUser(jam.hostUuid)}
    {@const joined = $joinedJamStore?.url === listeningZoneJamKey(jam)}
    {@const hostName = hostNameOf(jam.hostUuid, jam.hostName)}
    <div
        class="flex flex-col gap-1.5 rounded-lg border p-2.5 {joined
            ? 'border-[#1ed760]/60 bg-[#1ed760]/10'
            : 'border-white/10 bg-white/5'}"
        data-testid="listening-zone-room"
    >
        <div class="flex items-center gap-2 min-w-0">
            <span
                class="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase {home
                    ? 'bg-[#1ed760]/20 text-[#1ed760]'
                    : 'bg-white/10 text-white/70'}"
            >
                {live
                    ? $LL.spotify.listeningZone.kindLive()
                    : home
                      ? $LL.spotify.listeningZone.kindHome()
                      : $LL.spotify.listeningZone.kindSpotify()}
            </span>
            <p class="m-0 truncate text-sm font-bold text-white/95">
                {jam.title ??
                    (live
                        ? $LL.spotify.listeningZone.liveOf({ name: hostName })
                        : home
                          ? $LL.spotify.listeningZone.homeJamOf({ name: hostName })
                          : $LL.spotify.listeningZone.jamOf({ name: hostName }))}
            </p>
            <div class="ml-auto shrink-0">
                <LightEffectsToggle
                    on={$lampEffectsEnabledStore}
                    label={$lampEffectsEnabledStore
                        ? $LL.spotify.listeningZone.lightsDisable()
                        : $LL.spotify.listeningZone.lightsEnable()}
                    onclick={() => lampEffectsEnabledStore.update((enabled) => !enabled)}
                    testid="jam-lights-toggle"
                />
            </div>
        </div>
        {#if jam.title}
            <p class="m-0 truncate text-xs text-white/60">{$LL.spotify.listeningZone.hostedBy({ name: hostName })}</p>
        {/if}
        {#if hostTrack && !live}
            <p class="m-0 truncate text-xs text-white/75">♫ {hostTrack.artistName} — {hostTrack.trackTitle}</p>
        {/if}
        <p class="m-0 truncate text-xs text-white/50">
            {$LL.spotify.listeningZone.participants({ count: $jamParticipantsCountStore.get(jam.hostUuid) ?? 0 })}{room
                .zone.areaName
                ? ` · ${room.zone.areaName}`
                : ""}
        </p>
        {#if mine}
            <button
                type="button"
                class="self-start rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/80 hover:bg-white/20"
                aria-pressed={room.jam.lightsOff !== true}
                aria-label={room.jam.lightsOff
                    ? $LL.spotify.listeningZone.lightsEnableForAll()
                    : $LL.spotify.listeningZone.lightsDisableForAll()}
                onclick={() => updateOwnRoom({ lightsOff: room.jam.lightsOff !== true })}
                data-testid="jam-lights-toggle-all"
            >
                {room.jam.lightsOff
                    ? $LL.spotify.listeningZone.lightsEnableForAll()
                    : $LL.spotify.listeningZone.lightsDisableForAll()}
            </button>
        {:else if room.jam.lightsOff}
            <p class="m-0 text-xs text-white/50" data-testid="jam-lights-off-by-host">
                {$LL.spotify.listeningZone.lightsOffByHost()}
            </p>
        {/if}
        {#if !live}
            <Button
                variant="light"
                appearance="border"
                size="sm"
                onclick={() => toggleKaraokeRoom(room)}
                dataTestId="jam-karaoke-open">{$LL.spotify.karaoke.title()}</Button
            >
        {/if}
        {#if home}
            {#if mine}
                <JukeboxPlaybackControls {room} available={canHomeJam} />
            {/if}
            <button
                type="button"
                class="self-start rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/80 hover:bg-white/20"
                onclick={() => toggleQueue(jam.hostUuid)}
                data-testid="jukebox-queue-toggle"
            >
                {$LL.spotify.listeningZone.queue({
                    count:
                        ($jukeboxQueuesStore.get(jam.hostUuid)?.tracks.length ?? 0) +
                        ($jukeboxQueuesStore.get(jam.hostUuid)?.upcoming.length ?? 0),
                })}
            </button>
            {#if openQueues.has(jam.hostUuid)}
                <JukeboxQueue {room} />
            {/if}
        {/if}
        {#if !home}
            <!-- Spotify and Live rooms share their music through the same media session. -->
            <JamAudioControls
                jam={{ areaId: room.zone.areaId, propertyId: room.zone.propertyId, hostUuid: jam.hostUuid }}
                {mine}
                {live}
                onListen={live ? () => joinJam(room) : undefined}
                session={jamAudioSession}
                micDeviceId={$requestedMicrophoneDeviceIdStore}
                captureState={jamMusicCaptureState}
            />
        {/if}
        {#if mine}
            <Button
                variant="light"
                appearance="border"
                size="sm"
                onclick={() => {
                    endAudioOf(room);
                    stopSharingJam();
                }}
            >
                {live
                    ? $LL.spotify.listeningZone.stopLive()
                    : home
                      ? $LL.spotify.listeningZone.stopHome()
                      : $LL.spotify.listeningZone.stop()}
            </Button>
        {:else if !live || joined}
            <!-- Without the desktop app, a Jukebox is joined without sound: to add, remove and move tracks. -->
            <Button
                variant="success"
                size="sm"
                appearance={joined ? "border" : "filled"}
                onclick={() => {
                    if (joined) {
                        endAudioOf(room);
                        leaveJam();
                    } else if (home) {
                        joinHomeJam(room);
                    } else {
                        joinJam(room);
                    }
                }}
                dataTestId={home ? "listening-zone-join-home" : "listening-zone-join"}
            >
                {joined
                    ? $LL.spotify.listeningZone.leave()
                    : home
                      ? canHomeJam
                          ? $LL.spotify.listeningZone.joinHome()
                          : $LL.spotify.listeningZone.joinHomeSilent()
                      : $LL.spotify.listeningZone.join()}
            </Button>
            {#if !home && !live && canHomeJam && (following || (hostTrack && spotifyTrackUri(hostTrack.trackUrl)))}
                <Button
                    variant="success"
                    appearance="border"
                    size="sm"
                    onclick={() => followedUserUuidStore.set(following ? undefined : jam.hostUuid)}
                    dataTestId="listening-zone-listen-via-extension"
                >
                    {following ? $LL.spotify.card.stopListeningAlong() : $LL.spotify.listeningZone.listenViaExtension()}
                </Button>
            {/if}
            {#if home && !canHomeJam}
                <p class="m-0 text-xs text-white/60">{$LL.spotify.listeningZone.homeSilentNote()}</p>
            {:else if joined && home}
                <p class="m-0 text-xs text-white/60">{$LL.spotify.listeningZone.homeQueueHint()}</p>
            {/if}
        {/if}
    </div>
{/each}
