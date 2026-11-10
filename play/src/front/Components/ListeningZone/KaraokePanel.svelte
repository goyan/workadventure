<script lang="ts">
    import { onDestroy, onMount, untrack } from "svelte";
    import * as Sentry from "@sentry/svelte";
    import { LL } from "../../../i18n/i18n-svelte";
    import { LyricsTrackSchema, lyricsRecordingKey } from "../../../common/Lyrics";
    import type { LyricsTrack } from "../../../common/Lyrics";
    import { activeLyricIndex, parseLrc } from "../../Karaoke/Lrc";
    import { fetchLyrics } from "../../Karaoke/LyricsApi";
    import { LyricsLoader } from "../../Karaoke/LyricsLoader";
    import { karaokePositionMs } from "../../Karaoke/JamKaraoke";
    import type { KaraokePlayback } from "../../Karaoke/JamKaraoke";
    import type { JamRoom } from "../../ListeningZone/ListeningZoneController";
    import { chatSidebarWidthStore } from "../../Chat/ChatSidebarWidthStore";
    import { chatVisibilityStore } from "../../Stores/ChatStore";
    import { windowSize } from "../../Stores/CoWebsiteStore";
    import { karaokeInputFocusStore } from "../../Stores/UserInputStore";
    import Button from "../UI/Button.svelte";

    let {
        room,
        playback,
        onclose,
        loader = new LyricsLoader(fetchLyrics),
    }: {
        room: JamRoom;
        playback: KaraokePlayback;
        onclose: () => void;
        loader?: LyricsLoader;
    } = $props();

    let loadState = $derived(loader.state);
    let now = $state(Date.now());
    let offsetMs = $state(0);
    let manualScroll = $state(false);
    let lyricsContainer: HTMLDivElement | undefined = $state();
    let searchOpen = $state(false);
    let searchTitle = $state("");
    let searchArtist = $state("");
    let override = $state<LyricsTrack | undefined>();
    let previousTrackKey: string | undefined;
    let requestedKey = "";
    let track = $derived(override ?? playback.track ?? undefined);
    let currentKey = $derived(playback.track ? lyricsRecordingKey(playback.track) : "");
    let lookupKey = $derived(
        JSON.stringify([
            track ? lyricsRecordingKey(track) : "",
            playback.next ? lyricsRecordingKey(playback.next) : "",
        ]),
    );
    let result = $derived($loadState.status === "ready" ? $loadState.lyrics : undefined);
    let found = $derived(result?.status === "found" ? result : undefined);
    let lines = $derived(parseLrc(found?.syncedLyrics ?? ""));
    let active = $derived(
        playback.positionAt > 0 ? activeLyricIndex(lines, karaokePositionMs(playback, now, offsetMs)) : -1,
    );

    $effect(() => {
        if (previousTrackKey === currentKey) return;
        previousTrackKey = currentKey;
        untrack(() => {
            override = undefined;
            manualScroll = false;
        });
    });
    $effect(() => {
        if (requestedKey === lookupKey) return;
        requestedKey = lookupKey;
        const tracks = untrack(() => ({ track, next: playback.next ?? undefined }));
        loader.load(tracks.track, tracks.next).catch((error) => Sentry.captureException(error));
    });
    $effect(() => {
        const current = active;
        const container = lyricsContainer;
        if (manualScroll || !container || current < 0) return;
        const element = container.querySelector<HTMLElement>(`[data-line="${current}"]`);
        if (element) container.scrollTop = Math.max(0, element.offsetTop - container.clientHeight / 3);
    });
    onMount(() => {
        const timer = setInterval(() => {
            now = Date.now();
        }, 250);
        return () => clearInterval(timer);
    });
    onDestroy(() => {
        loader.destroy();
        karaokeInputFocusStore.set(false);
    });

    function search(event: SubmitEvent): void {
        event.preventDefault();
        const parsed = LyricsTrackSchema.safeParse({ title: searchTitle, artist: searchArtist });
        if (parsed.success) {
            override = parsed.data;
            searchOpen = false;
            karaokeInputFocusStore.set(false);
        }
    }

    function keydown(event: KeyboardEvent): void {
        event.stopPropagation();
        if (
            event.target instanceof Node &&
            lyricsContainer?.contains(event.target) &&
            ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(event.key)
        ) {
            manualScroll = true;
        }
        if (event.key === "Escape") {
            event.preventDefault();
            onclose();
        }
    }

    function scrollManually(event: Event): void {
        if (event.target instanceof Node && lyricsContainer?.contains(event.target)) manualScroll = true;
    }
</script>

<div
    class="pointer-events-auto absolute top-4 z-[310] flex max-h-[calc(100%-6rem)] w-[min(24rem,calc(100%-2rem))] flex-col gap-3 overflow-hidden rounded-xl border border-white/20 bg-contrast/95 p-4 shadow-xl backdrop-blur"
    style:left={`${$chatVisibilityStore ? Math.max(16, Math.min($chatSidebarWidthStore + 16, $windowSize.width - 400)) : 16}px`}
    aria-label={$LL.spotify.karaoke.title()}
    role="dialog"
    tabindex="-1"
    data-testid="karaoke-panel"
    onkeydown={keydown}
    onwheel={scrollManually}
    ontouchmove={scrollManually}
    onpointerdown={scrollManually}
    onfocusin={() => karaokeInputFocusStore.set(true)}
    onfocusout={(event) => {
        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
            karaokeInputFocusStore.set(false);
        }
    }}
>
    <div class="flex items-center justify-between gap-2">
        <div class="min-w-0">
            <h2 class="m-0 truncate text-lg font-bold">{$LL.spotify.karaoke.title()}</h2>
            <p class="m-0 truncate text-xs opacity-60">{room.jam.title ?? room.jam.hostName}</p>
        </div>
        <Button size="sm" appearance="ghost" aria-label={$LL.spotify.karaoke.close()} onclick={onclose}>×</Button>
    </div>
    {#if track}
        <div>
            <p class="m-0 font-bold">{track.title}</p>
            <p class="m-0 text-sm opacity-70">{track.artist}</p>
        </div>
    {/if}
    {#if $loadState.status === "loading"}
        <p class="m-0 text-sm" role="status">{$LL.spotify.karaoke.loading()}</p>
    {:else if $loadState.status === "error"}
        <p class="m-0 text-sm" role="status">{$LL.spotify.karaoke.error()}</p>
        <Button
            size="sm"
            onclick={() =>
                loader.load(track, playback.next ?? undefined).catch((error) => Sentry.captureException(error))}
            >{$LL.spotify.karaoke.retry()}</Button
        >
    {:else if found?.instrumental}
        <p class="m-0 text-sm" role="status">{$LL.spotify.karaoke.instrumental()}</p>
    {:else if found}
        {#if lines.length}
            <label class="flex items-center gap-2 text-xs">
                {$LL.spotify.karaoke.offset()}
                <input type="range" min="-5000" max="5000" step="250" bind:value={offsetMs} class="min-w-0 flex-1" />
                <span class="tabular-nums">{(offsetMs / 1000).toFixed(2)} s</span>
            </label>
            {#if !playback.positionAt}
                <p class="m-0 text-xs opacity-70">{$LL.spotify.karaoke.noPosition()}</p>
            {:else if !playback.playing}
                <p class="m-0 text-xs opacity-70">{$LL.spotify.karaoke.paused()}</p>
            {/if}
            {#if manualScroll}
                <Button
                    size="sm"
                    appearance="border"
                    onclick={() => {
                        manualScroll = false;
                    }}>{$LL.spotify.karaoke.follow()}</Button
                >
            {/if}
        {:else}
            <p class="m-0 text-xs opacity-70">{$LL.spotify.karaoke.unsynced()}</p>
        {/if}
        <div
            bind:this={lyricsContainer}
            class="relative min-h-0 flex-1 overflow-y-auto overscroll-contain select-text"
            tabindex="0"
            role="textbox"
            aria-readonly="true"
            aria-multiline="true"
            aria-label={$LL.spotify.karaoke.title()}
            data-testid="karaoke-lyrics"
        >
            {#if lines.length}
                {#each lines as line, index (index)}
                    <p
                        data-line={index}
                        aria-current={index === active ? "true" : undefined}
                        class="m-0 min-h-6 py-2 text-base {index === active
                            ? 'font-bold text-[#1ed760]'
                            : 'opacity-65'}"
                    >
                        {line.text}
                    </p>
                {/each}
            {:else}
                <p class="m-0 whitespace-pre-line text-sm">{found.plainLyrics}</p>
            {/if}
        </div>
        <p class="m-0 text-[10px] opacity-50">
            {$LL.spotify.karaoke.source({ name: found.source === "lrclib" ? "LRCLIB" : "lyrics.ovh" })}
        </p>
    {:else}
        <p class="m-0 text-sm" role="status">{track ? $LL.spotify.karaoke.missing() : $LL.spotify.karaoke.noTrack()}</p>
    {/if}
    <Button
        size="sm"
        appearance="ghost"
        onclick={() => {
            searchTitle = track?.title ?? "";
            searchArtist = track?.artist ?? "";
            searchOpen = !searchOpen;
        }}>{$LL.spotify.karaoke.choose()}</Button
    >
    {#if searchOpen}
        <form class="flex flex-col gap-2" onsubmit={search}>
            <label class="text-xs"
                >{$LL.spotify.karaoke.trackTitle()}<input
                    class="mt-1 w-full"
                    maxlength="200"
                    required
                    bind:value={searchTitle}
                /></label
            >
            <label class="text-xs"
                >{$LL.spotify.karaoke.artist()}<input
                    class="mt-1 w-full"
                    maxlength="200"
                    required
                    bind:value={searchArtist}
                /></label
            >
            <Button type="submit" size="sm">{$LL.spotify.karaoke.search()}</Button>
        </form>
    {/if}
</div>
