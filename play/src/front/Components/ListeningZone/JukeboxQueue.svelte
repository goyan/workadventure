<script lang="ts">
    import { onMount } from "svelte";
    import { SvelteSet } from "svelte/reactivity";
    import { isHomeJam, listeningZoneJamKey, MAX_LISTENING_ZONE_JAM_TITLE_LENGTH } from "@workadventure/map-editor";
    import { LL } from "../../../i18n/i18n-svelte";
    import { isLocalUser, type JamRoom, updateOwnRoom } from "../../ListeningZone/ListeningZoneController";
    import { joinedJamStore } from "../../ListeningZone/ListeningZoneStore";
    import type { JukeboxTrack } from "../../Interfaces/DesktopAppInterfaces";
    import {
        addToJukebox,
        jukeboxQueuesStore,
        likeTrack,
        moveInJukebox,
        removeFromJukebox,
        requestJukeboxQueue,
        trackUriOf,
    } from "../../Spotify/HomeJam";
    import { listenAlongAvailableStore } from "../../Spotify/ListeningFollower";
    import { localUserStore } from "../../Connection/LocalUserStore";
    import Input from "../Input/Input.svelte";
    import Button from "../UI/Button.svelte";

    interface Props {
        room: JamRoom;
    }

    let { room }: Props = $props();

    let queue = $derived($jukeboxQueuesStore.get(room.jam.hostUuid));
    let tracks = $derived(queue?.tracks ?? []);
    // What the host's playlist plays next: shown, never edited (Spotify only edits the tracks added to the queue).
    let upcoming = $derived(queue?.upcoming ?? []);
    let mine = $derived(isLocalUser(room.jam.hostUuid));
    let joined = $derived($joinedJamStore?.url === listeningZoneJamKey(room.jam));
    let djMode = $derived(isHomeJam(room.jam) && room.jam.djMode === true);
    let canAdd = $derived(mine || joined);
    // Saved to the Liked Songs of this computer's Spotify: the desktop app with the extension.
    let canLike = $derived($listenAlongAvailableStore && window.WAD?.likeOnSpotify !== undefined);
    /** Tracks liked from here, shown as such: the heart only adds. */
    const liked = new SvelteSet<string>();

    function isOwn(track: JukeboxTrack): boolean {
        return track.addedByUuid !== "" && track.addedByUuid === localUserStore.getLocalUser()?.uuid;
    }

    // The host does everything; the one who added a track removes and moves it; the others remove, unless DJ mode.
    function canRemove(track: JukeboxTrack): boolean {
        return mine || (joined && (!djMode || isOwn(track)));
    }

    function canMove(track: JukeboxTrack): boolean {
        return mine || (joined && isOwn(track));
    }

    function like(track: JukeboxTrack): void {
        if (likeTrack(track.uri)) liked.add(track.uri);
    }

    let link = $state("");
    let invalidLink = $state(false);
    let title = $state("");

    onMount(() => {
        title = room.jam.title ?? "";
        requestJukeboxQueue(room.jam.hostUuid);
    });

    function add(): void {
        const uri = trackUriOf(link);
        if (!uri) {
            invalidLink = true;
            return;
        }
        addToJukebox(room, uri);
        link = "";
    }
</script>

<div class="flex flex-col gap-2 rounded-md bg-black/20 p-2" data-testid="jukebox-queue">
    {#if tracks.length === 0 && upcoming.length === 0}
        <p class="m-0 text-xs text-white/50">{$LL.spotify.listeningZone.queueEmpty()}</p>
    {/if}
    {#each tracks as track, index (track.uid)}
        <div class="flex min-w-0 items-center gap-2">
            {#if track.artworkUrl}
                <img
                    src={track.artworkUrl}
                    alt=""
                    class="h-8 w-8 shrink-0 rounded object-cover"
                    referrerpolicy="no-referrer"
                />
            {:else}
                <div class="h-8 w-8 shrink-0 rounded bg-white/10"></div>
            {/if}
            <div class="min-w-0 flex-1">
                <p class="m-0 truncate text-xs font-bold text-white">{track.title}</p>
                <p class="m-0 truncate text-[11px] text-white/60">
                    {track.artist}{track.addedBy
                        ? ` · ${$LL.spotify.listeningZone.addedBy({ name: track.addedBy })}`
                        : ""}
                </p>
            </div>
            {#if canLike}
                <button
                    type="button"
                    class="shrink-0 rounded px-1 py-0.5 {liked.has(track.uri)
                        ? 'text-[#1ed760]'
                        : 'text-white/60 hover:bg-white/10 hover:text-white'}"
                    title={$LL.spotify.listeningZone.like()}
                    aria-label={$LL.spotify.listeningZone.like()}
                    onclick={() => like(track)}
                    data-testid="jukebox-like"
                >
                    {liked.has(track.uri) ? "♥" : "♡"}
                </button>
            {/if}
            {#if canMove(track)}
                <div class="flex shrink-0 flex-col leading-none">
                    <button
                        type="button"
                        class="rounded px-1 text-[10px] text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-30"
                        title={$LL.spotify.listeningZone.moveUp()}
                        aria-label={$LL.spotify.listeningZone.moveUp()}
                        disabled={index === 0}
                        onclick={() => moveInJukebox(room, track, "up")}
                        data-testid="jukebox-move-up">▲</button
                    >
                    <button
                        type="button"
                        class="rounded px-1 text-[10px] text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-30"
                        title={$LL.spotify.listeningZone.moveDown()}
                        aria-label={$LL.spotify.listeningZone.moveDown()}
                        disabled={index === tracks.length - 1}
                        onclick={() => moveInJukebox(room, track, "down")}
                        data-testid="jukebox-move-down">▼</button
                    >
                </div>
            {/if}
            {#if canRemove(track)}
                <button
                    type="button"
                    class="shrink-0 rounded px-1.5 py-0.5 text-white/60 hover:bg-white/10 hover:text-white"
                    title={$LL.spotify.listeningZone.remove()}
                    aria-label={$LL.spotify.listeningZone.remove()}
                    onclick={() => removeFromJukebox(room, track)}
                    data-testid="jukebox-remove"
                >
                    ✕
                </button>
            {/if}
        </div>
    {/each}

    {#if upcoming.length > 0}
        <p class="m-0 mt-1 truncate text-[11px] font-bold uppercase tracking-wide text-white/50">
            {queue?.contextName
                ? $LL.spotify.listeningZone.upNextIn({ name: queue.contextName })
                : $LL.spotify.listeningZone.upNext()}
        </p>
        {#each upcoming as track, index (`${index}:${track.uri}`)}
            <div class="flex min-w-0 items-center gap-2 opacity-80" data-testid="jukebox-upcoming">
                {#if track.artworkUrl}
                    <img
                        src={track.artworkUrl}
                        alt=""
                        class="h-8 w-8 shrink-0 rounded object-cover"
                        referrerpolicy="no-referrer"
                    />
                {:else}
                    <div class="h-8 w-8 shrink-0 rounded bg-white/10"></div>
                {/if}
                <div class="min-w-0 flex-1">
                    <p class="m-0 truncate text-xs font-bold text-white">{track.title}</p>
                    <p class="m-0 truncate text-[11px] text-white/60">{track.artist}</p>
                </div>
                {#if canLike}
                    <button
                        type="button"
                        class="shrink-0 rounded px-1 py-0.5 {liked.has(track.uri)
                            ? 'text-[#1ed760]'
                            : 'text-white/60 hover:bg-white/10 hover:text-white'}"
                        title={$LL.spotify.listeningZone.like()}
                        aria-label={$LL.spotify.listeningZone.like()}
                        onclick={() => {
                            if (likeTrack(track.uri)) liked.add(track.uri);
                        }}
                    >
                        {liked.has(track.uri) ? "♥" : "♡"}
                    </button>
                {/if}
            </div>
        {/each}
    {/if}

    {#if canAdd}
        <form
            class="flex items-start gap-2"
            onsubmit={(event) => {
                event.preventDefault();
                add();
            }}
        >
            <div class="min-w-0 flex-1">
                <Input
                    id="jukebox-add-{room.jam.hostUuid}"
                    size="sm"
                    placeholder={$LL.spotify.listeningZone.queueAddPlaceholder()}
                    bind:value={link}
                    status={invalidLink ? "error" : undefined}
                    errorHelperText={invalidLink ? $LL.spotify.listeningZone.invalidTrackLink() : null}
                    oninput={() => (invalidLink = false)}
                />
            </div>
            <Button variant="success" size="sm" type="submit">{$LL.spotify.listeningZone.queueAdd()}</Button>
        </form>
    {/if}

    {#if mine}
        <form
            class="flex items-start gap-2"
            onsubmit={(event) => {
                event.preventDefault();
                updateOwnRoom({ title });
            }}
        >
            <div class="min-w-0 flex-1">
                <Input
                    id="jukebox-title-{room.jam.hostUuid}"
                    size="sm"
                    placeholder={$LL.spotify.listeningZone.titlePlaceholder()}
                    maxlength={MAX_LISTENING_ZONE_JAM_TITLE_LENGTH}
                    bind:value={title}
                />
            </div>
            <Button variant="light" appearance="border" size="sm" type="submit">
                {$LL.spotify.listeningZone.rename()}
            </Button>
        </form>
        <label class="flex items-center gap-2 text-xs text-white/80">
            <input
                type="checkbox"
                checked={djMode}
                onchange={(event) => updateOwnRoom({ djMode: event.currentTarget.checked })}
                data-testid="jukebox-dj-mode"
            />
            {$LL.spotify.listeningZone.djMode()}
        </label>
    {/if}
</div>
