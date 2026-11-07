<script lang="ts">
    import { isSpotifyJamUrl, MAX_LISTENING_ZONE_JAM_TITLE_LENGTH } from "@workadventure/map-editor";
    import { LL } from "../../../i18n/i18n-svelte";
    import {
        allJamRoomsStore,
        canOpenJamStore,
        ownJamRoomStore,
        shareJam,
        startHomeJam,
    } from "../../ListeningZone/ListeningZoneController";
    import { currentListeningZoneStore } from "../../ListeningZone/ListeningZoneStore";
    import { spotifyAccount } from "../../Spotify/SpotifyAccount";
    import { desktopSpotifyPlayer } from "../../Spotify/LocalSpotifyPlayer";
    import { listenAlongAvailableStore } from "../../Spotify/ListeningFollower";
    import { handleOpenMenuEvent, settingsSubMenuTargetStore, SubMenusInterface } from "../../Stores/MenuStore";
    import Input from "../Input/Input.svelte";
    import Button from "../UI/Button.svelte";
    import JamRoomsList from "./JamRoomsList.svelte";
    import { IconHeadphones } from "@wa-icons";

    interface Props {
        onDragStart?: (event: PointerEvent) => void;
        onDragKeydown?: (event: KeyboardEvent) => void;
    }

    let { onDragStart, onDragKeydown }: Props = $props();

    const linked = spotifyAccount.linked;
    // The desktop app reads the Spotify app of this computer: there is no account to link.
    const readsLocalPlayer = desktopSpotifyPlayer() !== undefined;

    /** Creating a room: its title and kind, then the invite link of a Spotify Jam. */
    let creating: "choose" | "spotify" | undefined = $state();
    let title = $state("");
    let jamUrl = $state("");
    let invalidLink = $state(false);

    let zone = $derived($currentListeningZoneStore);
    let rooms = $derived($allJamRoomsStore);
    // A home Jam plays on the Spotify app of this computer, through the desktop app and the Spicetify extension.
    let canHomeJam = $derived($listenAlongAvailableStore);

    function startCreating(): void {
        creating = "choose";
    }

    function cancelCreating(): void {
        creating = undefined;
        title = "";
        jamUrl = "";
        invalidLink = false;
    }

    function submitJam(): void {
        const url = jamUrl.trim();
        if (!isSpotifyJamUrl(url)) {
            invalidLink = true;
            return;
        }
        shareJam(url, title);
        cancelCreating();
    }

    function openHomeJam(): void {
        if (!canHomeJam) return;
        startHomeJam(title);
        cancelCreating();
    }

    function openSpotifySettings(): void {
        settingsSubMenuTargetStore.set("spotify");
        handleOpenMenuEvent(SubMenusInterface.settings);
    }
</script>

{#if zone}
    <div
        class="w-80 max-w-[90vw] max-h-[70vh] overflow-y-auto overflow-x-hidden bg-contrast/80 backdrop-blur rounded-lg pointer-events-auto"
        data-testid="listening-zone-bubble"
    >
        <div class="p-4 flex flex-col gap-3">
            <button
                type="button"
                class="flex items-start gap-3 w-full p-0 bg-transparent border-none text-start cursor-grab active:cursor-grabbing touch-none select-none"
                onpointerdown={onDragStart}
                onkeydown={onDragKeydown}
                data-testid="listening-zone-drag-handle"
            >
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
                        {rooms.length > 0
                            ? $LL.spotify.listeningZone.rooms({ count: rooms.length })
                            : $LL.spotify.listeningZone.noJam()}
                    </p>
                </div>
            </button>

            <JamRoomsList />

            {#if creating}
                <div class="flex flex-col gap-2">
                    <Input
                        id="listening-zone-jam-title"
                        size="sm"
                        placeholder={$LL.spotify.listeningZone.titlePlaceholder()}
                        maxlength={MAX_LISTENING_ZONE_JAM_TITLE_LENGTH}
                        bind:value={title}
                    />
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
                    {:else}
                        <p class="m-0 text-xs font-bold text-white/80">{$LL.spotify.listeningZone.chooseKind()}</p>
                        <button
                            type="button"
                            class="flex flex-col gap-0.5 rounded-lg border border-white/10 bg-white/5 p-2.5 text-start hover:bg-white/10"
                            onclick={() => (creating = "spotify")}
                            data-testid="listening-zone-create-spotify"
                        >
                            <span class="text-sm font-bold text-white"
                                >{$LL.spotify.listeningZone.kindSpotifyTitle()}</span
                            >
                            <span class="text-xs text-white/60"
                                >{$LL.spotify.listeningZone.kindSpotifyDescription()}</span
                            >
                        </button>
                        <button
                            type="button"
                            class="flex flex-col gap-0.5 rounded-lg border border-[#1ed760]/40 bg-[#1ed760]/10 p-2.5 text-start enabled:hover:bg-[#1ed760]/20 disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={!canHomeJam}
                            onclick={openHomeJam}
                            data-testid="listening-zone-create-home"
                        >
                            <span class="text-sm font-bold text-[#1ed760]"
                                >{$LL.spotify.listeningZone.kindHomeTitle()}</span
                            >
                            <span class="text-xs text-white/60">{$LL.spotify.listeningZone.kindHomeDescription()}</span>
                        </button>
                        <Button variant="light" appearance="ghost" size="sm" onclick={cancelCreating}>
                            {$LL.spotify.listeningZone.cancel()}
                        </Button>
                    {/if}
                </div>
            {:else if !$ownJamRoomStore}
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
