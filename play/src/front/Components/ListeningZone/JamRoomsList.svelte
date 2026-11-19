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
        type JamRoom,
    } from "../../ListeningZone/ListeningZoneController";
    import { JamRoomKind as RoomKind } from "../../ListeningZone/JamRoomKind";
    import { joinedJamStore } from "../../ListeningZone/ListeningZoneStore";
    import { followedUserUuidStore, listenAlongAvailableStore } from "../../Spotify/ListeningFollower";
    import { listeningByUserUuidStore } from "../../Spotify/SpotifyListeningDirectory";
    import { playersStore } from "../../Stores/PlayersStore";
    import { jukeboxQueuesStore } from "../../Spotify/HomeJam";
    import { jamAudioSession } from "../../ListeningZone/GameJamAudioSession";
    import { jamMusicCapture } from "../../ListeningZone/JamMusicCapture";
    import { requestedMicrophoneDeviceIdStore } from "../../Stores/MediaStore";
    import { toggleKaraokeRoom } from "../../Karaoke/JamKaraoke";
    import Button from "../UI/Button.svelte";
    import Input from "../Input/Input.svelte";
    import JamAudience from "./JamAudience.svelte";
    import JamAudioControls from "./JamAudioControls.svelte";
    import JamLinkStatus from "./JamLinkStatus.svelte";
    import JukeboxPlaybackControls from "./JukeboxPlaybackControls.svelte";
    import JukeboxQueue from "./JukeboxQueue.svelte";
    import { IconChevronDown, IconHeadphones, IconLayoutGrid, IconMicrophone, IconMusic, IconSearch } from "@wa-icons";

    // A home Jam plays on the Spotify app of this computer, through the desktop app and the Spicetify extension.
    let canHomeJam = $derived($listenAlongAvailableStore);
    /** The Jukeboxes whose queue is shown, by host uuid. */
    const openQueues = new SvelteSet<string>();
    const jamMusicCaptureState = jamMusicCapture.state;
    const roomKinds = Object.values(RoomKind);
    let selectedKind = $state(RoomKind.All);
    function kindOf(room: JamRoom): RoomKind {
        return isLiveJam(room.jam) ? RoomKind.Live : isHomeJam(room.jam) ? RoomKind.Jukebox : RoomKind.Jam;
    }
    function selectTab(event: KeyboardEvent, kind: RoomKind): void {
        const index = roomKinds.indexOf(kind);
        const next =
            event.key === "ArrowRight"
                ? (index + 1) % roomKinds.length
                : event.key === "ArrowLeft"
                  ? (index + roomKinds.length - 1) % roomKinds.length
                  : event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? roomKinds.length - 1
                      : undefined;
        if (next === undefined) return;
        event.preventDefault();
        event.stopPropagation();
        selectedKind = roomKinds[next] ?? RoomKind.All;
        const button = event.currentTarget;
        if (button instanceof HTMLElement)
            button.parentElement?.querySelector<HTMLButtonElement>(`[data-room-kind="${selectedKind}"]`)?.focus();
    }
    let search = $state("");
    let browsing = $state(false);
    // Undefined follows the current room; null means the user collapsed every card.
    let selectedHost = $state<string | null | undefined>();
    let orderedRooms = $derived([
        ...$allJamRoomsStore.filter((room) => isLocalUser(room.jam.hostUuid)),
        ...$allJamRoomsStore.filter(
            (room) => !isLocalUser(room.jam.hostUuid) && room.jam.hostUuid === $joinedJamStore?.hostUuid,
        ),
        ...$allJamRoomsStore.filter(
            (room) => !isLocalUser(room.jam.hostUuid) && room.jam.hostUuid !== $joinedJamStore?.hostUuid,
        ),
    ]);
    let shownRooms = $derived(
        orderedRooms.filter(
            (room) =>
                (!(browsing || selectedHost === null) ||
                    selectedKind === RoomKind.All ||
                    kindOf(room) === selectedKind) &&
                [
                    room.jam.title ?? "",
                    hostNameOf(room.jam.hostUuid, room.jam.hostName),
                    room.zone.areaName,
                    $listeningByUserUuidStore.get(room.jam.hostUuid)?.trackTitle ?? "",
                    $listeningByUserUuidStore.get(room.jam.hostUuid)?.artistName ?? "",
                ]
                    .join(" ")
                    .toLocaleLowerCase()
                    .includes(search.trim().toLocaleLowerCase()),
        ),
    );
    let expandedHost = $derived(
        selectedHost === null
            ? undefined
            : shownRooms.some((room) => room.jam.hostUuid === selectedHost)
              ? selectedHost
              : shownRooms[0]?.jam.hostUuid,
    );

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

{#if $allJamRoomsStore.length > 1}
    <button
        type="button"
        class="self-start py-2 text-xs font-semibold text-white/80 hover:text-white"
        onclick={() => {
            browsing = !browsing;
            search = "";
        }}
        data-testid="jam-room-browse"
    >
        {browsing
            ? $LL.spotify.listeningZone.backToRoom()
            : $LL.spotify.listeningZone.browseRooms({ count: $allJamRoomsStore.length })}
    </button>
{/if}
{#if browsing || selectedHost === null}
    <div class="jam-room-tabs" role="tablist" aria-label={$LL.spotify.listeningZone.roomTypes()}>
        {#each roomKinds as kind (kind)}
            <button
                type="button"
                role="tab"
                aria-selected={selectedKind === kind}
                tabindex={selectedKind === kind ? 0 : -1}
                data-room-kind={kind}
                onclick={() => (selectedKind = kind)}
                onkeydown={(event) => selectTab(event, kind)}
            >
                {#if kind === RoomKind.All}<IconLayoutGrid font-size="16" />
                {:else if kind === RoomKind.Jam}<IconHeadphones font-size="16" />
                {:else if kind === RoomKind.Jukebox}<IconMusic font-size="16" />
                {:else}<IconMicrophone font-size="16" />{/if}
                <span
                    >{kind === RoomKind.All
                        ? $LL.spotify.listeningZone.allRooms()
                        : kind === RoomKind.Jam
                          ? $LL.spotify.listeningZone.jamRooms()
                          : kind === RoomKind.Jukebox
                            ? $LL.spotify.listeningZone.kindHome()
                            : $LL.spotify.listeningZone.kindLive()}</span
                >
                <span class="jam-room-tab-count"
                    >{orderedRooms.filter((room) => kind === RoomKind.All || kindOf(room) === kind).length}</span
                >
            </button>
        {/each}
    </div>
    <Input
        id="jam-room-search"
        size="sm"
        placeholder={$LL.spotify.listeningZone.searchRooms()}
        aria-label={$LL.spotify.listeningZone.searchRoomsLabel()}
        appendSide="left"
        bind:value={search}
        onkeydown={(event) => event.stopPropagation()}
    >
        {#snippet inputAppend()}<IconSearch font-size="16" aria-hidden="true" />{/snippet}
    </Input>
{/if}
{#each shownRooms.filter((room) => browsing || selectedHost === null || room.jam.hostUuid === expandedHost) as room (room.jam.hostUuid)}
    {@const jam = room.jam}
    {@const hostListening = $listeningByUserUuidStore.get(jam.hostUuid)}
    {@const hostTrack = isPlayingTrack(hostListening) ? hostListening : undefined}
    {@const home = isHomeJam(jam)}
    {@const live = isLiveJam(jam)}
    {@const following = $followedUserUuidStore === jam.hostUuid}
    {@const mine = isLocalUser(jam.hostUuid)}
    {@const joined = $joinedJamStore?.url === listeningZoneJamKey(jam)}
    {@const hostName = hostNameOf(jam.hostUuid, jam.hostName)}
    {@const expanded = !browsing && expandedHost === jam.hostUuid}
    <div
        class="jam-room overflow-hidden rounded-xl border {joined || mine
            ? 'border-[var(--jam-accent,#1ed760)]/40 bg-[var(--jam-accent,#1ed760)]/5'
            : 'border-white/10 bg-white/5'}"
        data-testid="listening-zone-room"
        data-expanded={expanded}
        data-room-host={jam.hostUuid}
    >
        <button
            type="button"
            class="flex w-full items-center gap-3 p-3 text-start hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            aria-expanded={expanded}
            onclick={() => {
                selectedHost = expanded ? null : jam.hostUuid;
                browsing = false;
                search = "";
            }}
            data-testid="jam-room-toggle"
        >
            {#if !expanded}
                <span
                    class="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl {live
                        ? 'bg-violet-400/15 text-secondary'
                        : 'bg-[var(--jam-accent,#1ed760)]/15 text-[var(--jam-accent,#1ed760)]'}"
                    aria-hidden="true"
                >
                    {#if hostTrack?.artworkUrl && !live}<img
                            class="h-full w-full object-cover"
                            src={hostTrack.artworkUrl}
                            alt=""
                        />
                    {:else if live}<IconMicrophone font-size="22" />{:else if home}<IconMusic
                            font-size="22"
                        />{:else}<IconHeadphones font-size="22" />{/if}
                </span>
            {/if}
            <span class="flex min-w-0 flex-1 flex-col gap-1">
                <span class="truncate text-sm font-bold text-white/95">
                    {jam.title ??
                        (live
                            ? $LL.spotify.listeningZone.liveOf({ name: hostName })
                            : home
                              ? $LL.spotify.listeningZone.homeJamOf({ name: hostName })
                              : $LL.spotify.listeningZone.jamOf({ name: hostName }))}
                </span>
                <span class="flex min-w-0 items-center gap-1.5 text-[10px] text-white/50">
                    <span
                        class="shrink-0 font-bold uppercase {live
                            ? 'text-secondary'
                            : 'text-[var(--jam-accent,#1ed760)]'}"
                        >{live
                            ? $LL.spotify.listeningZone.kindLive()
                            : home
                              ? $LL.spotify.listeningZone.kindHome()
                              : $LL.spotify.listeningZone.kindSpotify()}</span
                    >
                    <span class="truncate">· {hostName}{room.zone.areaName ? ` · ${room.zone.areaName}` : ""}</span>
                </span>
            </span>
            {#if !expanded}
                <span
                    class="flex shrink-0 items-center gap-1 text-[10px] text-white/50"
                    aria-label={$LL.spotify.listeningZone.audience({
                        count: $jamParticipantsCountStore.get(jam.hostUuid) ?? 1,
                    })}
                >
                    <IconHeadphones font-size="12" aria-hidden="true" />
                    {$jamParticipantsCountStore.get(jam.hostUuid) ?? 1}
                </span>
            {/if}
            <IconChevronDown
                font-size="16"
                class={expanded ? "shrink-0 rotate-180 text-[var(--jam-accent,#1ed760)]" : "shrink-0 text-white/40"}
            />
        </button>
        {#if expanded}
            {#if !home || !mine}
                <div class="jam-room-hero">
                    <div class="jam-room-art" aria-hidden="true">
                        {#if hostTrack?.artworkUrl && !live}
                            <img src={hostTrack.artworkUrl} alt="" />
                        {:else if live}
                            <IconMicrophone font-size="40" />
                        {:else}
                            <IconMusic font-size="40" />
                        {/if}
                    </div>
                    <div class="min-w-0 flex-1">
                        <p class="jam-room-eyebrow">
                            {live
                                ? $LL.spotify.listeningZone.kindLive()
                                : home
                                  ? $LL.spotify.listeningZone.kindHome()
                                  : $LL.spotify.listeningZone.kindSpotify()}
                        </p>
                        <p class="jam-room-track">
                            {!live && hostTrack ? hostTrack.trackTitle : jam.title || hostName}
                        </p>
                        <p class="m-0 mt-2 text-xs text-white/60">
                            {!live && hostTrack ? hostTrack.artistName : hostName}
                        </p>
                    </div>
                </div>
            {/if}
            <div class="flex flex-col gap-2 border-t border-white/10 p-3" data-testid="jam-room-details">
                <JamAudience {room} />
                {#if !home && !live}
                    <JamLinkStatus {room} {mine} {joined} />
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
                            {following
                                ? $LL.spotify.card.stopListeningAlong()
                                : $LL.spotify.listeningZone.listenViaExtension()}
                        </Button>
                    {/if}
                    {#if home && !canHomeJam}
                        <p class="m-0 text-xs text-white/60">{$LL.spotify.listeningZone.homeSilentNote()}</p>
                    {:else if joined && home}
                        <p class="m-0 text-xs text-white/60">{$LL.spotify.listeningZone.homeQueueHint()}</p>
                    {/if}
                {/if}
            </div>
        {/if}
    </div>
{:else}
    {#if search.trim()}
        <p class="m-0 py-3 text-center text-xs text-white/50">{$LL.spotify.listeningZone.noMatchingRooms()}</p>
    {/if}
{/each}
