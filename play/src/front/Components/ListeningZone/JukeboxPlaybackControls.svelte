<script lang="ts">
    import { onMount } from "svelte";
    import { LL } from "../../../i18n/i18n-svelte";
    import { SpotifyPlaybackCommand } from "../../Interfaces/DesktopAppInterfaces";
    import type { SpotifyPlaybackState } from "../../Interfaces/DesktopAppInterfaces";
    import type { JamRoom } from "../../ListeningZone/ListeningZoneController";
    import { controlJukeboxPlayback } from "../../Spotify/HomeJam";
    import PlayerPauseIcon from "../Icons/PlayerPauseIcon.svelte";
    import PlayerPlayIcon from "../Icons/PlayerPlayIcon.svelte";
    import TooltipAbove from "./TooltipAbove.svelte";

    let { room, available }: { room: JamRoom; available: boolean } = $props();
    let playback = $state<SpotifyPlaybackState | null>(null);
    let ready = $derived(available && playback !== null && !!window.WAD?.controlSpotifyPlayback);
    let position = $derived(Math.min(playback?.positionMs ?? 0, playback?.durationMs ?? 0));
    let toggle: SpotifyPlaybackCommand.Play | SpotifyPlaybackCommand.Pause = $derived(
        playback?.playing ? SpotifyPlaybackCommand.Pause : SpotifyPlaybackCommand.Play,
    );
    let commands = $derived([
        SpotifyPlaybackCommand.Shuffle,
        SpotifyPlaybackCommand.Previous,
        toggle,
        SpotifyPlaybackCommand.Next,
        SpotifyPlaybackCommand.Repeat,
    ] as const);
    let labels = $derived({
        [SpotifyPlaybackCommand.Play]: $LL.spotify.listeningZone.playbackPlay(),
        [SpotifyPlaybackCommand.Pause]: $LL.spotify.listeningZone.playbackPause(),
        [SpotifyPlaybackCommand.Next]: $LL.spotify.listeningZone.playbackNext(),
        [SpotifyPlaybackCommand.Previous]: $LL.spotify.listeningZone.playbackPrevious(),
        [SpotifyPlaybackCommand.Shuffle]: $LL.spotify.listeningZone.playbackShuffle(),
        [SpotifyPlaybackCommand.Repeat]:
            playback?.repeat === 2
                ? $LL.spotify.listeningZone.playbackRepeatOne()
                : playback?.repeat === 1
                  ? $LL.spotify.listeningZone.playbackRepeatAll()
                  : $LL.spotify.listeningZone.playbackRepeatOff(),
    });
    const paths = {
        [SpotifyPlaybackCommand.Previous]: "M19 4v16L7 12zM3 4h3v16H3z",
        [SpotifyPlaybackCommand.Next]: "M5 4v16l12-8zM18 4h3v16h-3z",
        [SpotifyPlaybackCommand.Shuffle]:
            "m18 3 4 4-4 4V8h-2l-8 9H2v-2h5l8-9h3zm0 10 4 4-4 4v-3h-3l-3-3 1.4-1.5 2.6 2.5h2zM2 6h6l3 3-1.4 1.5L7 8H2z",
        [SpotifyPlaybackCommand.Repeat]: "m17 1 4 4-4 4V6H6v5H4V4h13zm-10 22-4-4 4-4v3h11v-5h2v7H7z",
    };
    onMount(() =>
        window.WAD?.watchSpotifyPlayback?.((state) => {
            playback = state;
        }),
    );

    function command(action: SpotifyPlaybackCommand, value?: number): void {
        if (ready) controlJukeboxPlayback(room, { command: action, ...(value === undefined ? {} : { value }) });
    }
    function time(ms: number): string {
        const seconds = Math.floor(ms / 1000);
        return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    }
</script>

<div class="flex flex-col gap-3 rounded-xl bg-black/30 p-3" data-testid="jukebox-player">
    <div class="flex min-w-0 items-center gap-3">
        {#if playback?.track?.artworkUrl}
            <img src={playback.track.artworkUrl} alt="" class="h-12 w-12 shrink-0 rounded-md object-cover" />
        {:else}
            <span
                class="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-white/10 text-2xl"
                aria-hidden="true">♫</span
            >
        {/if}
        <div class="min-w-0 flex-1">
            <p class="m-0 truncate text-sm font-semibold text-white">
                {playback?.track?.title || $LL.spotify.listeningZone.playbackEmpty()}
            </p>
            <p class="m-0 truncate text-xs text-white/60">{playback?.track?.artist || "Spotify"}</p>
        </div>
    </div>
    {#if !ready}<p class="m-0 text-xs text-white/60" role="status">
            {$LL.spotify.listeningZone.playbackDisconnected()}
        </p>{/if}
    <div class="flex items-center justify-between gap-1">
        {#each commands as action (action)}
            {@const active =
                (action === SpotifyPlaybackCommand.Shuffle && playback?.shuffle) ||
                (action === SpotifyPlaybackCommand.Repeat && !!playback?.repeat)}
            <TooltipAbove label={labels[action]}>
                <button
                    type="button"
                    class="relative flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 {action ===
                    toggle
                        ? 'bg-[#1ed760] text-black'
                        : active
                          ? 'bg-[#1ed760]/15 text-[#1ed760]'
                          : 'bg-transparent text-white/70'} hover:brightness-125 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:cursor-default disabled:opacity-40"
                    disabled={!ready}
                    onclick={() => command(action)}
                    aria-label={labels[action]}
                    aria-pressed={action === SpotifyPlaybackCommand.Shuffle || action === SpotifyPlaybackCommand.Repeat
                        ? !!active
                        : undefined}
                    data-testid={`jukebox-${action}`}
                >
                    {#if action === SpotifyPlaybackCommand.Pause}
                        <PlayerPauseIcon
                            height="h-5"
                            width="w-5"
                            strokeColor="stroke-black"
                            fillColor="fill-black"
                            hover=""
                        />
                    {:else if action === SpotifyPlaybackCommand.Play}
                        <PlayerPlayIcon
                            height="h-5"
                            width="w-5"
                            strokeColor="stroke-black"
                            fillColor="fill-black"
                            hover=""
                        />
                    {:else}
                        <svg class="h-5 w-5 fill-current" viewBox="0 0 24 24" aria-hidden="true"
                            ><path d={paths[action]} /></svg
                        >
                        {#if action === SpotifyPlaybackCommand.Repeat && playback?.repeat === 2}<span
                                class="absolute text-[9px] font-bold"
                                aria-hidden="true">1</span
                            >{/if}
                    {/if}
                </button>
            </TooltipAbove>
        {/each}
    </div>
    <div class="flex items-center gap-2 text-[10px] tabular-nums text-white/60">
        <span>{time(position)}</span>
        <input
            type="range"
            min="0"
            max={playback?.durationMs || 1}
            step="1000"
            value={position}
            style="--fill: {(playback?.durationMs ? position / playback.durationMs : 0) * 100}%"
            disabled={!ready || !playback?.durationMs}
            class="player-range min-w-0 flex-1"
            aria-label={$LL.spotify.listeningZone.playbackSeek()}
            data-testid="jukebox-seek"
            onchange={(event) => command(SpotifyPlaybackCommand.Seek, Math.round(Number(event.currentTarget.value)))}
        />
        <span>{time(playback?.durationMs ?? 0)}</span>
    </div>
    <div class="flex items-center gap-2">
        <TooltipAbove
            label={playback?.volume === 0
                ? $LL.spotify.listeningZone.audioUnmute()
                : $LL.spotify.listeningZone.audioMute()}
        >
            <button
                type="button"
                class="flex h-7 w-7 items-center justify-center rounded border-0 bg-transparent text-white/70 disabled:opacity-40"
                disabled={!ready}
                onclick={() => command(SpotifyPlaybackCommand.Mute)}
                data-testid="jukebox-mute"
                aria-label={playback?.volume === 0
                    ? $LL.spotify.listeningZone.audioUnmute()
                    : $LL.spotify.listeningZone.audioMute()}
            >
                <svg class="h-4 w-4 fill-current" viewBox="0 0 24 24" aria-hidden="true"
                    ><path d="M3 9v6h4l5 4V5L7 9zM15 8a5 5 0 0 1 0 8v-2a3 3 0 0 0 0-4z" />
                    {#if playback?.volume === 0}<path d="m16 8 6 8-1 1-6-8z" />{/if}
                </svg>
            </button>
        </TooltipAbove>
        <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={playback?.volume ?? 1}
            style="--fill: {(playback?.volume ?? 1) * 100}%"
            disabled={!ready}
            class="player-range min-w-0 flex-1"
            aria-label={$LL.spotify.listeningZone.audioVolume()}
            data-testid="jukebox-volume"
            onchange={(event) => command(SpotifyPlaybackCommand.Volume, Number(event.currentTarget.value))}
        />
        <span class="w-7 text-right text-[10px] tabular-nums text-white/60"
            >{Math.round((playback?.volume ?? 1) * 100)}%</span
        >
    </div>
</div>

<style>
    .player-range {
        -webkit-appearance: none;
        appearance: none;
        height: 14px;
        margin: 0;
        padding: 0;
        background: transparent;
        outline: none;
        cursor: pointer;
    }
    .player-range::-webkit-slider-runnable-track {
        height: 4px;
        border-radius: 9999px;
        background: linear-gradient(to right, #1ed760 var(--fill), rgb(255 255 255 / 0.25) var(--fill));
    }
    .player-range::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 14px;
        height: 14px;
        /* (track height - thumb height) / 2 */
        margin-top: -5px;
        border: 0;
        border-radius: 9999px;
        background: #fff;
    }
    .player-range::-moz-range-track {
        height: 4px;
        border-radius: 9999px;
        background: rgb(255 255 255 / 0.25);
    }
    .player-range::-moz-range-progress {
        height: 4px;
        border-radius: 9999px;
        background: #1ed760;
    }
    .player-range::-moz-range-thumb {
        width: 14px;
        height: 14px;
        border: 0;
        border-radius: 9999px;
        background: #fff;
    }
    .player-range:focus-visible {
        outline: 2px solid #fff;
        outline-offset: 4px;
    }
</style>
