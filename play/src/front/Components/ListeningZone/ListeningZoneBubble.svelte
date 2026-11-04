<script lang="ts">
    import { isHomeJam, isSpotifyJamUrl, listeningZoneJamKey } from "@workadventure/map-editor";
    import { LL } from "../../../i18n/i18n-svelte";
    import { isPlayingTrack } from "../../../common/SpotifyListening";
    import {
        canOpenJamStore,
        currentJamsStore,
        isLocalUser,
        jamParticipantsCountStore,
        joinHomeJam,
        joinJam,
        leaveJam,
        localPlayerName,
        ownJamStore,
        shareJam,
        startHomeJam,
        stopSharingJam,
    } from "../../ListeningZone/ListeningZoneController";
    import { currentListeningZoneStore, joinedJamStore } from "../../ListeningZone/ListeningZoneStore";
    import { spotifyAccount } from "../../Spotify/SpotifyAccount";
    import { desktopSpotifyPlayer } from "../../Spotify/LocalSpotifyPlayer";
    import { listenAlongAvailableStore } from "../../Spotify/ListeningFollower";
    import { listeningByUserUuidStore } from "../../Spotify/SpotifyListeningDirectory";
    import { playersStore } from "../../Stores/PlayersStore";
    import { handleOpenMenuEvent, settingsSubMenuTargetStore, SubMenusInterface } from "../../Stores/MenuStore";
    import Input from "../Input/Input.svelte";
    import Button from "../UI/Button.svelte";
    import { IconHeadphones } from "@wa-icons";

    const linked = spotifyAccount.linked;
    // The desktop app reads the Spotify app of this computer: there is no account to link.
    const readsLocalPlayer = desktopSpotifyPlayer() !== undefined;

    /** Creating a room: choosing its kind, then pasting the invite link of a Spotify Jam. */
    let creating: "choose" | "spotify" | undefined = $state();
    let jamUrl = $state("");
    let invalidLink = $state(false);

    let zone = $derived($currentListeningZoneStore);
    let jams = $derived($currentJamsStore);
    // A home Jam plays on the Spotify app of this computer, through the desktop app and the Spicetify extension.
    let canHomeJam = $derived($listenAlongAvailableStore);

    /** Rooms opened before the session name was known have no name: the host's current name is shown instead. */
    function hostNameOf(hostUuid: string, savedName: string): string {
        if (savedName) return savedName;
        if (isLocalUser(hostUuid)) return localPlayerName() || "?";
        return [...$playersStore.values()].find((player) => player.userUuid === hostUuid)?.name || "?";
    }

    function startCreating(): void {
        creating = canHomeJam ? "choose" : "spotify";
    }

    function cancelCreating(): void {
        creating = undefined;
        jamUrl = "";
        invalidLink = false;
    }

    function submitJam(): void {
        const url = jamUrl.trim();
        if (!isSpotifyJamUrl(url)) {
            invalidLink = true;
            return;
        }
        shareJam(url);
        cancelCreating();
    }

    function openHomeJam(): void {
        startHomeJam();
        cancelCreating();
    }

    function openSpotifySettings(): void {
        settingsSubMenuTargetStore.set("spotify");
        handleOpenMenuEvent(SubMenusInterface.settings);
    }
</script>

{#if zone}
    <div
        class="w-80 max-w-[90vw] bg-contrast/80 backdrop-blur rounded-lg pointer-events-auto overflow-hidden"
        data-testid="listening-zone-bubble"
    >
        <div class="p-4 flex flex-col gap-3">
            <div class="flex items-start gap-3">
                <div
                    class="shrink-0 w-10 h-10 rounded-full bg-[#1ed760]/20 text-[#1ed760] flex items-center justify-center"
                    aria-hidden="true"
                >
                    <IconHeadphones font-size="20" />
                </div>
                <div class="flex-1 min-w-0">
                    <p class="m-0 text-sm font-bold text-white/95 truncate">
                        {zone.areaName || $LL.spotify.listeningZone.defaultName()}
                    </p>
                    <p class="m-0 text-xs text-white/50">
                        {jams.length > 0
                            ? $LL.spotify.listeningZone.rooms({ count: jams.length })
                            : $LL.spotify.listeningZone.noJam()}
                    </p>
                </div>
            </div>

            {#each jams as jam (listeningZoneJamKey(jam))}
                {@const hostListening = $listeningByUserUuidStore.get(jam.hostUuid)}
                {@const hostTrack = isPlayingTrack(hostListening) ? hostListening : undefined}
                {@const home = isHomeJam(jam)}
                {@const mine = isLocalUser(jam.hostUuid)}
                {@const joined = $joinedJamStore?.url === listeningZoneJamKey(jam)}
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
                            {home
                                ? $LL.spotify.listeningZone.homeJamOf({ name: hostNameOf(jam.hostUuid, jam.hostName) })
                                : $LL.spotify.listeningZone.jamOf({ name: hostNameOf(jam.hostUuid, jam.hostName) })}
                        </p>
                    </div>
                    {#if hostTrack}
                        <p class="m-0 truncate text-xs text-white/75">
                            ♫ {hostTrack.artistName} — {hostTrack.trackTitle}
                        </p>
                    {/if}
                    <p class="m-0 text-xs text-white/50">
                        {$LL.spotify.listeningZone.participants({
                            count: $jamParticipantsCountStore.get(jam.hostUuid) ?? 0,
                        })}
                    </p>
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
                            onclick={() => (joined ? leaveJam() : home ? joinHomeJam(jam) : joinJam(jam))}
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

            {#if creating === "spotify"}
                <form
                    class="flex flex-col gap-2"
                    onsubmit={(event) => {
                        event.preventDefault();
                        submitJam();
                    }}
                >
                    <Input
                        id="listening-zone-jam-url"
                        type="url"
                        size="sm"
                        placeholder={$LL.spotify.listeningZone.sharePlaceholder()}
                        bind:value={jamUrl}
                        status={invalidLink ? "error" : undefined}
                        errorHelperText={invalidLink ? $LL.spotify.listeningZone.invalidLink() : null}
                        oninput={() => (invalidLink = false)}
                    />
                    <div class="flex gap-2 justify-end">
                        <Button variant="light" appearance="ghost" size="sm" onclick={cancelCreating}>
                            {$LL.spotify.listeningZone.cancel()}
                        </Button>
                        <Button variant="success" size="sm" type="submit">
                            {$LL.spotify.listeningZone.submit()}
                        </Button>
                    </div>
                </form>
            {:else if creating === "choose"}
                <div class="flex flex-col gap-2">
                    <p class="m-0 text-xs font-bold text-white/80">{$LL.spotify.listeningZone.chooseKind()}</p>
                    <button
                        type="button"
                        class="flex flex-col gap-0.5 rounded-lg border border-white/10 bg-white/5 p-2.5 text-start hover:bg-white/10"
                        onclick={() => (creating = "spotify")}
                        data-testid="listening-zone-create-spotify"
                    >
                        <span class="text-sm font-bold text-white">{$LL.spotify.listeningZone.kindSpotifyTitle()}</span>
                        <span class="text-xs text-white/60">{$LL.spotify.listeningZone.kindSpotifyDescription()}</span>
                    </button>
                    <button
                        type="button"
                        class="flex flex-col gap-0.5 rounded-lg border border-[#1ed760]/40 bg-[#1ed760]/10 p-2.5 text-start hover:bg-[#1ed760]/20"
                        onclick={openHomeJam}
                        data-testid="listening-zone-create-home"
                    >
                        <span class="text-sm font-bold text-[#1ed760]">{$LL.spotify.listeningZone.kindHomeTitle()}</span
                        >
                        <span class="text-xs text-white/60">{$LL.spotify.listeningZone.kindHomeDescription()}</span>
                    </button>
                    <Button variant="light" appearance="ghost" size="sm" onclick={cancelCreating}>
                        {$LL.spotify.listeningZone.cancel()}
                    </Button>
                </div>
            {:else if !$ownJamStore}
                {#if $canOpenJamStore}
                    <Button variant="success" size="sm" onclick={startCreating} dataTestId="listening-zone-create">
                        {$LL.spotify.listeningZone.createRoom()}
                    </Button>
                {:else}
                    <p class="m-0 text-xs text-white/60">{$LL.spotify.listeningZone.zoneFull()}</p>
                {/if}
            {/if}

            {#if !$linked && !readsLocalPlayer}
                <button
                    type="button"
                    class="m-0 p-0 bg-transparent border-none text-xs text-white/60 underline text-start cursor-pointer"
                    onclick={openSpotifySettings}
                >
                    {$LL.spotify.listeningZone.linkInvite()}
                </button>
            {/if}
        </div>
    </div>
{/if}
