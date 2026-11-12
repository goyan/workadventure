<script lang="ts">
    import { onDestroy, onMount, untrack } from "svelte";
    import type { Component } from "svelte";
    import * as Sentry from "@sentry/svelte";
    import { LL } from "../../../i18n/i18n-svelte";
    import { LyricsTrackSchema, lyricsRecordingKey } from "../../../common/Lyrics";
    import type { LyricsTrack } from "../../../common/Lyrics";
    import { activeLyricIndex, parseLrc } from "../../Karaoke/Lrc";
    import { fetchLyrics } from "../../Karaoke/LyricsApi";
    import { LyricsLoader } from "../../Karaoke/LyricsLoader";
    import { centeredScrollTop, lyricLineProgress } from "../../Karaoke/LyricsView";
    import { karaokePositionMs } from "../../Karaoke/JamKaraoke";
    import type { KaraokePlayback } from "../../Karaoke/JamKaraoke";
    import type { JamRoom } from "../../ListeningZone/ListeningZoneController";
    import { chatSidebarWidthStore } from "../../Chat/ChatSidebarWidthStore";
    import { chatVisibilityStore } from "../../Stores/ChatStore";
    import { windowSize } from "../../Stores/CoWebsiteStore";
    import { karaokeInputFocusStore } from "../../Stores/UserInputStore";
    import Button from "../UI/Button.svelte";
    import PlayerPauseIcon from "../Icons/PlayerPauseIcon.svelte";
    import {
        IconAlertTriangle,
        IconArrowDown,
        IconClock,
        IconInfoCircle,
        IconMicrophone,
        IconMusic,
        IconRestore,
        IconSearch,
        IconX,
    } from "@wa-icons";

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

    /** The panel's width (26rem) and its margin, kept on screen beside an open chat. */
    const PANEL_ROOM_PX = 432;

    let loadState = $derived(loader.state);
    let now = $state(Date.now());
    let offsetMs = $state(0);
    let manualScroll = $state(false);
    let lyricsContainer: HTMLDivElement | undefined = $state();
    let searchOpen = $state(false);
    let offsetOpen = $state(false);
    let searchTitle = $state("");
    let searchArtist = $state("");
    let override = $state<LyricsTrack | undefined>();
    let previousTrackKey: string | undefined;
    let requestedKey = "";
    let scrolledLines: unknown;
    let scrolledIndex = -1;
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
    // Without a playback position the synchronized lyrics are only read: nothing is dimmed nor followed.
    let following = $derived(lines.length > 0 && playback.positionAt > 0);
    let position = $derived(karaokePositionMs(playback, now, offsetMs));
    let active = $derived(following ? activeLyricIndex(lines, position) : -1);
    let fill = $derived(lyricLineProgress(lines, active, position, track?.durationMs));
    let trackProgress = $derived(
        playback.track?.durationMs && playback.positionAt > 0
            ? karaokePositionMs(playback, now) / playback.track.durationMs
            : undefined,
    );
    let offsetLabel = $derived(`${offsetMs > 0 ? "+" : ""}${(offsetMs / 1000).toFixed(2)} s`);

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
    // Depends on the current line only, not on the clock: a smooth scroll must not be restarted four times a second.
    $effect(() => {
        const current = active;
        const container = lyricsContainer;
        const shown = lines;
        if (manualScroll || !container || current < 0) return;
        const element = container.querySelector<HTMLElement>(`[data-line="${current}"]`);
        if (!element) return;
        const top = centeredScrollTop(element.offsetTop, element.offsetHeight, container.clientHeight);
        // The first placement, another song and a seek jump there; only the line by line progress glides.
        const glide =
            scrolledLines === shown &&
            scrolledIndex >= 0 &&
            Math.abs(current - scrolledIndex) <= 2 &&
            !(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
        scrolledLines = shown;
        scrolledIndex = current;
        if (typeof container.scrollTo === "function") {
            container.scrollTo({ top, behavior: glide ? "smooth" : "instant" });
        } else {
            container.scrollTop = top;
        }
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

    function retry(): void {
        loader.load(track, playback.next ?? undefined).catch((error) => Sentry.captureException(error));
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

{#snippet notice(Icon: Component, text: string)}
    <div class="flex flex-col items-center gap-3 px-6 py-8 text-center">
        <span
            class="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white/70"
            aria-hidden="true"><Icon font-size="24" /></span
        >
        <p class="m-0 text-sm text-white/80" role="status">{text}</p>
    </div>
{/snippet}

<div
    class="karaoke-panel pointer-events-auto absolute top-4 z-[310] flex max-h-[calc(100%-6rem)] w-[min(26rem,calc(100%-2rem))] flex-col overflow-hidden rounded-2xl border border-white/10 bg-contrast/80 text-white shadow-2xl backdrop-blur-md"
    style:left={`${$chatVisibilityStore ? Math.max(16, Math.min($chatSidebarWidthStore + 16, $windowSize.width - PANEL_ROOM_PX)) : 16}px`}
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
    <div class="flex items-start gap-3 px-4 pt-4">
        <span
            class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#1ed760]/15 text-[#1ed760]"
            aria-hidden="true"><IconMicrophone font-size="24" /></span
        >
        <div class="min-w-0 flex-1">
            <div class="flex items-baseline gap-1.5 text-xs">
                <h2 class="m-0 shrink-0 text-xs font-bold uppercase tracking-wider text-[#1ed760]">
                    {$LL.spotify.karaoke.title()}
                </h2>
                <p class="m-0 truncate text-white/70">· {room.jam.title ?? room.jam.hostName}</p>
            </div>
            {#if track}
                <p class="m-0 truncate text-lg font-bold leading-tight" title={track.title}>{track.title}</p>
                <p class="m-0 truncate text-sm text-white/70" title={track.artist}>{track.artist}</p>
            {/if}
        </div>
        <button
            type="button"
            class="-mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            aria-label={$LL.spotify.karaoke.close()}
            title={$LL.spotify.karaoke.close()}
            onclick={onclose}
            data-testid="karaoke-close"><IconX font-size="18" /></button
        >
    </div>
    {#if trackProgress !== undefined}
        <div
            class="mx-4 mt-3 h-1 shrink-0 overflow-hidden rounded-full bg-white/15"
            role="progressbar"
            aria-label={track?.title}
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={Math.round(trackProgress * 100)}
        >
            <div
                class="karaoke-track-progress h-full rounded-full bg-[#1ed760]"
                style:width={`${trackProgress * 100}%`}
            ></div>
        </div>
    {/if}

    {#if $loadState.status === "loading"}
        <div class="flex flex-col items-center gap-4 px-6 py-8" role="status">
            <div class="flex w-full flex-col items-center gap-3 motion-safe:animate-pulse" aria-hidden="true">
                <span class="h-4 w-3/5 rounded-full bg-white/15"></span>
                <span class="h-5 w-4/5 rounded-full bg-white/25"></span>
                <span class="h-4 w-1/2 rounded-full bg-white/15"></span>
                <span class="h-4 w-2/3 rounded-full bg-white/10"></span>
            </div>
            <p class="m-0 text-sm text-white/80">{$LL.spotify.karaoke.loading()}</p>
        </div>
    {:else if $loadState.status === "error"}
        {@render notice(IconAlertTriangle, $LL.spotify.karaoke.error())}
        <div class="flex justify-center pb-4">
            <Button size="sm" onclick={retry}>{$LL.spotify.karaoke.retry()}</Button>
        </div>
    {:else if found?.instrumental}
        {@render notice(IconMusic, $LL.spotify.karaoke.instrumental())}
    {:else if found}
        {#if !lines.length}
            <p class="m-0 flex items-start gap-1.5 px-4 pt-3 text-xs text-white/70">
                <IconInfoCircle font-size="14" class="mt-px shrink-0" />{$LL.spotify.karaoke.unsynced()}
            </p>
        {:else if !playback.positionAt}
            <p class="m-0 flex items-start gap-1.5 px-4 pt-3 text-xs text-white/70">
                <IconInfoCircle font-size="14" class="mt-px shrink-0" />{$LL.spotify.karaoke.noPosition()}
            </p>
        {:else if !playback.playing}
            <p class="m-0 px-4 pt-3 text-xs">
                <span class="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-white/80">
                    <PlayerPauseIcon height="h-3.5" width="w-3.5" strokeColor="stroke-white/80" hover="" />
                    {$LL.spotify.karaoke.paused()}
                </span>
            </p>
        {/if}
        <div
            class="relative mt-2 flex min-h-0 flex-1 basis-96 flex-col has-[[role=textbox]:focus-visible]:outline has-[[role=textbox]:focus-visible]:outline-2 has-[[role=textbox]:focus-visible]:-outline-offset-2 has-[[role=textbox]:focus-visible]:outline-white/70"
        >
            <div
                bind:this={lyricsContainer}
                class="karaoke-lyrics relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 select-text focus:outline-none"
                class:karaoke-stage={following}
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
                            class="karaoke-line m-0 min-h-7 py-2 text-center text-xl font-bold leading-snug {!following
                                ? 'text-white/90'
                                : index === active
                                  ? 'scale-105 text-[#1ed760]'
                                  : index < active
                                    ? 'text-white/55'
                                    : 'text-white/80'}"
                            class:karaoke-gap={!line.text}
                        >
                            <span
                                class:karaoke-fill={index === active}
                                style:--karaoke-fill={index === active && fill !== undefined
                                    ? `${Math.round(fill * 1000) / 10}%`
                                    : undefined}>{line.text}</span
                            >
                        </p>
                    {/each}
                {:else}
                    <p class="m-0 whitespace-pre-line py-3 text-base leading-relaxed text-white/90">
                        {found.plainLyrics}
                    </p>
                {/if}
            </div>
            {#if manualScroll && following}
                <div class="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
                    <button
                        type="button"
                        class="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-[#1ed760] px-3 py-1.5 text-sm font-bold text-contrast shadow-lg hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                        onclick={() => {
                            manualScroll = false;
                        }}
                        data-testid="karaoke-follow"
                        ><IconArrowDown font-size="16" />{$LL.spotify.karaoke.follow()}</button
                    >
                </div>
            {/if}
        </div>
    {:else}
        {@render notice(IconMusic, track ? $LL.spotify.karaoke.missing() : $LL.spotify.karaoke.noTrack())}
    {/if}

    {#if playback.next}
        <p class="m-0 flex items-baseline gap-1.5 px-4 pt-2 text-xs text-white/70" data-testid="karaoke-next">
            <span class="shrink-0 font-bold uppercase tracking-wider">{$LL.spotify.karaoke.next()}</span>
            <span class="min-w-0 truncate"
                ><span class="text-white/90">{playback.next.title}</span> — {playback.next.artist}</span
            >
        </p>
    {/if}
    <div class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-white/10 px-3 py-2 text-xs">
        {#if found && lines.length}
            <button
                type="button"
                class="karaoke-chip"
                class:text-[#1ed760]={offsetMs !== 0}
                aria-expanded={offsetOpen}
                aria-label={`${$LL.spotify.karaoke.offset()} (${offsetLabel})`}
                title={$LL.spotify.karaoke.offset()}
                onclick={() => {
                    offsetOpen = !offsetOpen;
                    searchOpen = false;
                }}
                data-testid="karaoke-offset-toggle"
                ><IconClock font-size="14" /><span class="tabular-nums">{offsetLabel}</span></button
            >
        {/if}
        <button
            type="button"
            class="karaoke-chip"
            aria-expanded={searchOpen}
            onclick={() => {
                searchTitle = track?.title ?? "";
                searchArtist = track?.artist ?? "";
                searchOpen = !searchOpen;
                offsetOpen = false;
            }}
            data-testid="karaoke-choose"><IconSearch font-size="14" />{$LL.spotify.karaoke.choose()}</button
        >
        {#if found}
            <span class="ml-auto text-[10px] text-white/70">
                {$LL.spotify.karaoke.source({ name: found.source === "lrclib" ? "LRCLIB" : "lyrics.ovh" })}
            </span>
        {/if}
    </div>
    {#if offsetOpen && found && lines.length}
        <div class="flex items-center gap-2 border-t border-white/10 px-4 py-3 text-xs">
            <label class="flex min-w-0 flex-1 flex-col gap-1">
                <span class="text-white/70">{$LL.spotify.karaoke.offset()}</span>
                <input type="range" min="-5000" max="5000" step="250" bind:value={offsetMs} class="w-full min-w-0" />
            </label>
            <button
                type="button"
                class="karaoke-chip self-end"
                disabled={offsetMs === 0}
                aria-label={$LL.spotify.karaoke.offsetReset()}
                title={$LL.spotify.karaoke.offsetReset()}
                onclick={() => {
                    offsetMs = 0;
                }}><IconRestore font-size="14" /></button
            >
        </div>
    {/if}
    {#if searchOpen}
        <form class="flex flex-col gap-2 border-t border-white/10 px-4 py-3" onsubmit={search}>
            <label class="text-xs text-white/70"
                >{$LL.spotify.karaoke.trackTitle()}<input
                    class="input-text input-text-sm mt-1 w-full"
                    maxlength="200"
                    required
                    bind:value={searchTitle}
                /></label
            >
            <label class="text-xs text-white/70"
                >{$LL.spotify.karaoke.artist()}<input
                    class="input-text input-text-sm mt-1 w-full"
                    maxlength="200"
                    required
                    bind:value={searchArtist}
                /></label
            >
            <Button type="submit" size="sm">{$LL.spotify.karaoke.search()}</Button>
        </form>
    {/if}
</div>

<style>
    .karaoke-chip {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        border-radius: 9999px;
        padding: 0.25rem 0.625rem;
        background: rgb(255 255 255 / 0.1);
    }
    .karaoke-chip:hover:not(:disabled) {
        background: rgb(255 255 255 / 0.2);
    }
    .karaoke-chip:disabled {
        opacity: 0.4;
    }
    .karaoke-chip:focus-visible {
        outline: 2px solid #fff;
        outline-offset: 2px;
    }

    .karaoke-lyrics {
        scrollbar-width: thin;
        scrollbar-color: rgb(255 255 255 / 0.25) transparent;
    }
    /* Room above the first line and below the last one to bring them to the middle, where the edges fade out. */
    .karaoke-stage {
        padding-block: 8rem;
        mask-image: linear-gradient(to bottom, transparent, #000 18%, #000 82%, transparent);
    }
    .karaoke-line {
        transition:
            color 300ms ease,
            scale 300ms ease;
    }
    /* A musical gap: an empty line in the lyrics. */
    .karaoke-gap::before {
        content: "♪";
    }
    /* The current line turns green from its start, across its wrapped rows, as playback goes through it. */
    .karaoke-fill {
        color: transparent;
        background-image: linear-gradient(#1ed760, #1ed760), linear-gradient(#fff, #fff);
        background-repeat: no-repeat;
        background-size:
            var(--karaoke-fill, 100%) 100%,
            100% 100%;
        -webkit-background-clip: text;
        background-clip: text;
        transition: background-size 250ms linear;
    }
    .karaoke-track-progress {
        transition: width 250ms linear;
    }
    @media (prefers-reduced-motion: no-preference) {
        .karaoke-panel {
            animation: karaoke-in 200ms ease-out;
        }
    }
    @media (prefers-reduced-motion: reduce) {
        .karaoke-line,
        .karaoke-track-progress {
            transition: none;
        }
        /* No moving edge: the whole current line is green. */
        .karaoke-fill {
            transition: none;
            background-size:
                100% 100%,
                100% 100%;
        }
    }
    @media (forced-colors: active) {
        .karaoke-fill {
            color: inherit;
            background: none;
        }
    }
    @keyframes karaoke-in {
        from {
            opacity: 0;
            transform: translateX(-0.75rem);
        }
    }
</style>
