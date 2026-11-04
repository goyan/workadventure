<script lang="ts">
    import { SvelteSet } from "svelte/reactivity";
    import { isHomeJam, listeningZoneJamKey } from "@workadventure/map-editor";
    import { LL } from "../../../i18n/i18n-svelte";
    import { isPlayingTrack } from "../../../common/SpotifyListening";
    import {
        allJamRoomsStore,
        isLocalUser,
        jamParticipantsCountStore,
        joinHomeJam,
        joinJam,
        leaveJam,
        localPlayerName,
        stopSharingJam,
    } from "../../ListeningZone/ListeningZoneController";
    import { joinedJamStore } from "../../ListeningZone/ListeningZoneStore";
    import { listenAlongAvailableStore } from "../../Spotify/ListeningFollower";
    import { listeningByUserUuidStore } from "../../Spotify/SpotifyListeningDirectory";
    import { playersStore } from "../../Stores/PlayersStore";
    import { jukeboxQueuesStore } from "../../Spotify/HomeJam";
    import Button from "../UI/Button.svelte";
    import JukeboxQueue from "./JukeboxQueue.svelte";

    // A home Jam plays on the Spotify app of this computer, through the desktop app and the Spicetify extension.
    let canHomeJam = $derived($listenAlongAvailableStore);
    /** The Jukeboxes whose queue is shown, by host uuid. */
    const openQueues = new SvelteSet<string>();

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
                {home ? $LL.spotify.listeningZone.kindHome() : $LL.spotify.listeningZone.kindSpotify()}
            </span>
            <p class="m-0 truncate text-sm font-bold text-white/95">
                {jam.title ??
                    (home
                        ? $LL.spotify.listeningZone.homeJamOf({ name: hostName })
                        : $LL.spotify.listeningZone.jamOf({ name: hostName }))}
            </p>
        </div>
        {#if jam.title}
            <p class="m-0 truncate text-xs text-white/60">{$LL.spotify.listeningZone.hostedBy({ name: hostName })}</p>
        {/if}
        {#if hostTrack}
            <p class="m-0 truncate text-xs text-white/75">♫ {hostTrack.artistName} — {hostTrack.trackTitle}</p>
        {/if}
        <p class="m-0 truncate text-xs text-white/50">
            {$LL.spotify.listeningZone.participants({ count: $jamParticipantsCountStore.get(jam.hostUuid) ?? 0 })}{room
                .zone.areaName
                ? ` · ${room.zone.areaName}`
                : ""}
        </p>
        {#if home}
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
        {#if mine}
            <Button variant="light" appearance="border" size="sm" onclick={stopSharingJam}>
                {home ? $LL.spotify.listeningZone.stopHome() : $LL.spotify.listeningZone.stop()}
            </Button>
        {:else if home && !canHomeJam}
            <p class="m-0 text-xs text-white/60">{$LL.spotify.listeningZone.homeDesktopOnly()}</p>
        {:else}
            <Button
                variant="success"
                size="sm"
                appearance={joined ? "border" : "filled"}
                onclick={() => (joined ? leaveJam() : home ? joinHomeJam(room) : joinJam(room))}
                dataTestId={home ? "listening-zone-join-home" : "listening-zone-join"}
            >
                {joined
                    ? $LL.spotify.listeningZone.leave()
                    : home
                      ? $LL.spotify.listeningZone.joinHome()
                      : $LL.spotify.listeningZone.join()}
            </Button>
            {#if joined && home}
                <p class="m-0 text-xs text-white/60">{$LL.spotify.listeningZone.homeQueueHint()}</p>
            {/if}
        {/if}
    </div>
{/each}
