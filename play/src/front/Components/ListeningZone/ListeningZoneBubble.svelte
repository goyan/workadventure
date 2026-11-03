<script lang="ts">
    import { isSpotifyJamUrl } from "@workadventure/map-editor";
    import { LL } from "../../../i18n/i18n-svelte";
    import { isPlayingTrack } from "../../../common/SpotifyListening";
    import {
        currentJamParticipantsCountStore,
        currentJamStore,
        isLocalUser,
        joinJam,
        shareJam,
        stopSharingJam,
    } from "../../ListeningZone/ListeningZoneController";
    import { currentListeningZoneStore, joinedJamStore } from "../../ListeningZone/ListeningZoneStore";
    import { spotifyAccount } from "../../Spotify/SpotifyAccount";
    import { desktopSpotifyPlayer } from "../../Spotify/LocalSpotifyPlayer";
    import { listeningByUserUuidStore } from "../../Spotify/SpotifyListeningDirectory";
    import { handleOpenMenuEvent, settingsSubMenuTargetStore, SubMenusInterface } from "../../Stores/MenuStore";
    import Input from "../Input/Input.svelte";
    import Button from "../UI/Button.svelte";
    import { IconHeadphones } from "@wa-icons";

    const linked = spotifyAccount.linked;
    // The desktop app reads the Spotify app of this computer: there is no account to link.
    const readsLocalPlayer = desktopSpotifyPlayer() !== undefined;

    let sharing = $state(false);
    let jamUrl = $state("");
    let invalidLink = $state(false);

    let zone = $derived($currentListeningZoneStore);
    let jam = $derived($currentJamStore);
    let isHost = $derived(jam !== null && isLocalUser(jam.hostUuid));
    let joined = $derived(jam !== null && $joinedJamStore?.url === jam.url);
    let hostListening = $derived(jam ? $listeningByUserUuidStore.get(jam.hostUuid) : undefined);
    let hostTrack = $derived(isPlayingTrack(hostListening) ? hostListening : undefined);

    function submitJam(): void {
        const url = jamUrl.trim();
        if (!isSpotifyJamUrl(url)) {
            invalidLink = true;
            return;
        }
        shareJam(url);
        sharing = false;
        jamUrl = "";
        invalidLink = false;
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
                        {jam
                            ? $LL.spotify.listeningZone.jamOf({ name: jam.hostName })
                            : zone.areaName || $LL.spotify.listeningZone.defaultName()}
                    </p>
                    {#if jam}
                        {#if hostTrack}
                            <p class="m-0 text-xs text-white/75 truncate">
                                ♫ {hostTrack.artistName} — {hostTrack.trackTitle}
                            </p>
                        {/if}
                        <p class="m-0 text-xs text-white/50">
                            {$LL.spotify.listeningZone.participants({ count: $currentJamParticipantsCountStore })}
                        </p>
                    {:else if !sharing}
                        <p class="m-0 text-xs text-white/50">{$LL.spotify.listeningZone.noJam()}</p>
                    {/if}
                </div>
            </div>

            {#if sharing}
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
                        <Button
                            variant="light"
                            appearance="ghost"
                            size="sm"
                            onclick={() => {
                                sharing = false;
                                invalidLink = false;
                            }}
                        >
                            {$LL.spotify.listeningZone.cancel()}
                        </Button>
                        <Button variant="success" size="sm" type="submit">
                            {$LL.spotify.listeningZone.submit()}
                        </Button>
                    </div>
                </form>
            {:else if jam && isHost}
                <Button variant="light" appearance="border" size="sm" onclick={stopSharingJam}>
                    {$LL.spotify.listeningZone.stop()}
                </Button>
            {:else if jam}
                <Button
                    variant="success"
                    size="sm"
                    appearance={joined ? "border" : "filled"}
                    onclick={joinJam}
                    dataTestId="listening-zone-join"
                >
                    {joined ? $LL.spotify.listeningZone.joined() : $LL.spotify.listeningZone.join()}
                </Button>
            {:else}
                <Button variant="success" size="sm" onclick={() => (sharing = true)}>
                    {$LL.spotify.listeningZone.share()}
                </Button>
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
