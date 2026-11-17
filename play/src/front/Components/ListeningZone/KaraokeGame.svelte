<script lang="ts">
    import { onDestroy, onMount, untrack } from "svelte";
    import { derived, readable } from "svelte/store";
    import { buildKaraokeStageSpaceName, KaraokeStageAction } from "@workadventure/map-editor";
    import Debug from "debug";
    import type { JamRoom } from "../../ListeningZone/ListeningZoneController";
    import { isLocalUser } from "../../ListeningZone/ListeningZoneController";
    import { LL } from "../../../i18n/i18n-svelte";
    import {
        karaokeStagesStore,
        enableKaraokeGame,
        selectKaraokeSinger,
        requestKaraokeTurn,
        karaokeSingerName,
    } from "../../Karaoke/KaraokeStage";
    import { createKaraokeVoiceSession } from "../../Karaoke/KaraokeVoiceSession";
    import type { KaraokeVoiceSession } from "../../Karaoke/KaraokeVoiceSession";
    import { enterKaraokeGame, enterKaraokeSinger } from "../../Karaoke/KaraokeGameStore";
    import { gameManager } from "../../Phaser/Game/GameManager";
    import { localUserStore } from "../../Connection/LocalUserStore";
    import { jamMusicStreamsStore, jamMusicPublishersStore } from "../../ListeningZone/JamMusicStore";
    import { requestedMicrophoneDeviceIdStore } from "../../Stores/MediaStore";
    import { speakerSelectedStore } from "../../Stores/AudioOutputStore";
    import AudioStream from "../Video/PictureInPicture/AudioStream.svelte";
    import type { KaraokePlayback } from "../../Karaoke/JamKaraoke";
    import { listenAlongAvailableStore } from "../../Spotify/ListeningFollower";
    import { DESKTOP_APP_URL } from "../../Interfaces/DesktopAppInterfaces";
    import KaraokeScore from "./KaraokeScore.svelte";

    let { room, mine, playback }: { room: JamRoom; mine: boolean; playback: KaraokePlayback } = $props();
    const logger = Debug("karaoke-stage");
    const unblocked = readable(false);
    const volume = readable(1);
    let stage = $derived($karaokeStagesStore.get(room.jam.hostUuid));
    let singer = $derived(stage?.singerUuid ?? undefined);
    let myMic = $derived(singer !== undefined && isLocalUser(singer));
    let queued = $derived(stage?.queue.includes(localUserStore.getLocalUser()?.uuid ?? "") ?? false);
    let spaceName = $derived(
        stage?.enabled && singer
            ? buildKaraokeStageSpaceName({
                  ...stage,
                  singerUuid: singer,
                  roomUrl: gameManager.getCurrentGameScene().roomUrl,
              })
            : undefined,
    );
    let streamStore = $derived(
        derived(jamMusicStreamsStore, (streams) => (spaceName ? streams.get(spaceName) : undefined)),
    );
    let session: KaraokeVoiceSession | undefined;
    let connected = $derived(spaceName ? $jamMusicPublishersStore.has(spaceName) : false);
    let recording = $state(false);
    let micStream: MediaStream | undefined = $state();
    let pending = $state(false);
    let failed = $state(false);
    let clapped = $state(false);
    let autoStart = $state(false);
    /** Anyone sings, browsers included; hosting needs the desktop app and its Spotify extension, which give the melody. */
    let canHost = $derived(window.WAD?.desktop === true && $listenAlongAvailableStore);
    onMount(enterKaraokeGame);

    $effect(() => {
        // Store subscribers run synchronously here: untracked, their reads cannot become this effect's dependencies.
        return myMic ? untrack(enterKaraokeSinger) : undefined;
    });
    $effect(() => {
        if (autoStart && myMic && connected && !pending && !recording) {
            autoStart = false;
            sing().catch(() => undefined);
        }
    });

    $effect(() => {
        const name = spaceName;
        recording = false;
        micStream = undefined;
        pending = false;
        failed = false;
        clapped = false;
        if (!name) return;
        const current = createKaraokeVoiceSession(gameManager.getCurrentGameScene().spaceRegistry, (constraints) =>
            navigator.mediaDevices.getUserMedia(constraints),
        );
        session = current;
        let alive = true;
        current.join(name).catch((error: unknown) => {
            if (alive) failed = true;
            logger("Stage connection failed", error);
        });
        return () => {
            alive = false;
            if (session === current) session = undefined;
            current.leave().catch((error: unknown) => logger("Stage cleanup failed", error));
        };
    });
    $effect(() => {
        requestKaraokeTurn(room, KaraokeStageAction.Request);
    });
    $effect(() => {
        const tracks = micStream?.getAudioTracks() ?? [];
        const ended = (): void => {
            recording = false;
            micStream = undefined;
        };
        for (const track of tracks) track.addEventListener("ended", ended);
        return () => {
            for (const track of tracks) track.removeEventListener("ended", ended);
        };
    });
    onDestroy(() => {
        requestKaraokeTurn(room, KaraokeStageAction.Leave);
    });

    async function sing(): Promise<void> {
        const current = session;
        if (!current || !myMic || pending) return;
        pending = true;
        failed = false;
        try {
            const captured = await current.sing($requestedMicrophoneDeviceIdStore);
            if (session === current && myMic && captured) {
                micStream = captured;
                recording = true;
            }
        } catch (error) {
            if (session === current) failed = true;
            logger("Mic refused or unavailable", error);
        } finally {
            finishAttempt(current);
        }
    }
    function begin(): void {
        enableKaraokeGame(room, true);
        selectKaraokeSinger(room, room.jam.hostUuid);
        autoStart = true;
    }
    function takeTurn(): void {
        if (mine && !singer) selectKaraokeSinger(room, room.jam.hostUuid);
        else requestKaraokeTurn(room, KaraokeStageAction.Join);
        autoStart = !singer;
    }
    function finishAttempt(current: KaraokeVoiceSession): void {
        if (session === current) pending = false;
    }
</script>

{#snippet install(reason: string)}
    <div class="karaoke-install" data-testid="karaoke-install-desktop">
        <p class="m-0 text-xs text-white/80">💻 {reason}</p>
        <a class="karaoke-install-link" href={DESKTOP_APP_URL} target="_blank" rel="noopener noreferrer"
            >{$LL.spotify.karaoke.game.installDesktop()}</a
        >
    </div>
{/snippet}

<div class="text-sm" data-testid="karaoke-game" data-stage-space={spaceName} data-connected={connected}>
    <p class="m-0 mb-2 text-[11px] text-[#ffd166]" role="note">🧪 {$LL.spotify.karaoke.game.betaNote()}</p>
    {#if !stage?.enabled}
        {#if mine && canHost}
            <button type="button" class="karaoke-cta" onclick={begin} data-testid="karaoke-start">
                <span class="karaoke-cta-icon" aria-hidden="true">🎤</span>{$LL.spotify.karaoke.game.start()}
            </button>
            <p class="m-0 pt-2 text-center text-xs text-white/70">{$LL.spotify.karaoke.game.startHint()}</p>
        {:else if mine}
            {@render install($LL.spotify.karaoke.game.hostNeeds())}
        {:else}
            <p class="karaoke-waiting m-0">🎭 {$LL.spotify.karaoke.game.waiting()}</p>
        {/if}
    {:else}
        <div class="karaoke-onstage" aria-live="polite">
            <span class="karaoke-onstage-dot" class:karaoke-onstage-live={!!singer} aria-hidden="true"></span>
            <div class="min-w-0 flex-1">
                <span class="block text-[10px] font-bold uppercase tracking-widest text-white/60"
                    >{$LL.spotify.karaoke.show.upNext()}</span
                >
                <strong dir="auto" class="block truncate text-base"
                    >{singer ? karaokeSingerName(singer) : $LL.spotify.karaoke.game.ready()}</strong
                >
            </div>
            {#if singer}<span
                    class="karaoke-applause tabular-nums"
                    title={$LL.spotify.karaoke.game.applause({ count: stage.applause })}>👏 {stage.applause}</span
                >{/if}
        </div>
        <div class="mt-3 flex flex-col gap-2">
            {#if myMic}
                {#if recording}
                    <p class="karaoke-live m-0" role="status">
                        <span class="karaoke-live-dot" aria-hidden="true"></span>{$LL.spotify.karaoke.game.singing()}
                    </p>
                {:else}
                    <button
                        type="button"
                        class="karaoke-cta karaoke-cta-pulse"
                        disabled={!connected || pending}
                        onclick={sing}
                        data-testid="karaoke-sing"
                    >
                        <span class="karaoke-cta-icon" aria-hidden="true">🎙️</span>{connected
                            ? $LL.spotify.karaoke.game.sing()
                            : $LL.spotify.karaoke.game.connecting()}
                    </button>
                {/if}
                <button
                    type="button"
                    class="karaoke-secondary"
                    onclick={() => requestKaraokeTurn(room, KaraokeStageAction.Leave)}
                    >{$LL.spotify.karaoke.game.end()}</button
                >
            {:else}
                {#if queued}
                    <button
                        type="button"
                        class="karaoke-secondary"
                        onclick={() => requestKaraokeTurn(room, KaraokeStageAction.Leave)}
                        >✋ {$LL.spotify.karaoke.game.leave()}</button
                    >
                {:else}
                    <button type="button" class="karaoke-cta" onclick={takeTurn} data-testid="karaoke-join">
                        <span class="karaoke-cta-icon" aria-hidden="true">🙋</span>{$LL.spotify.karaoke.game.myTurn()}
                    </button>
                {/if}
                {#if singer}
                    <button
                        type="button"
                        class="karaoke-clap"
                        disabled={clapped}
                        onclick={() => {
                            clapped = true;
                            requestKaraokeTurn(room, KaraokeStageAction.Clap);
                        }}>👏 {$LL.spotify.karaoke.game.clap()}</button
                    >
                {/if}
            {/if}
            {#if mine}
                <div class="flex flex-wrap gap-2">
                    {#if singer && !myMic}<button
                            type="button"
                            class="karaoke-chip-button"
                            onclick={() => selectKaraokeSinger(room, stage?.queue[0] ?? null)}
                            >⏭ {$LL.spotify.karaoke.game.next()}</button
                        >{/if}
                    <button type="button" class="karaoke-chip-button" onclick={() => enableKaraokeGame(room, false)}
                        >⏻ {$LL.spotify.karaoke.game.stop()}</button
                    >
                </div>
            {/if}
        </div>
        {#if stage.queue.length}
            <p class="m-0 pt-3 text-[10px] font-bold uppercase tracking-widest text-white/60">
                {$LL.spotify.karaoke.game.queue()}
            </p>
            <ol class="m-0 mt-1 flex max-h-28 list-none flex-col gap-1 overflow-y-auto p-0">
                {#each stage.queue as uuid, index (uuid)}
                    <li class="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1 text-xs">
                        <span class="w-4 text-center font-bold text-[var(--jam-accent,#1ed760)]">{index + 1}</span>
                        <span dir="auto" class="min-w-0 flex-1 truncate">{karaokeSingerName(uuid)}</span>
                        {#if mine}<button
                                type="button"
                                class="karaoke-chip-button"
                                aria-label={$LL.spotify.karaoke.game.choose({ name: karaokeSingerName(uuid) })}
                                title={$LL.spotify.karaoke.game.choose({ name: karaokeSingerName(uuid) })}
                                onclick={() => selectKaraokeSinger(room, uuid)}>🎤</button
                            >{/if}
                    </li>
                {/each}
            </ol>
        {/if}
        {#if failed}<p class="m-0 pt-2 text-xs text-red-400" role="alert">{$LL.spotify.karaoke.game.micError()}</p>{/if}
        <KaraokeScore {room} {mine} {playback} {stage} {micStream} />
    {/if}
</div>
{#if spaceName}<AudioStream
        conversation={false}
        {streamStore}
        outputDeviceId={$speakerSelectedStore}
        isBlocked={unblocked}
        {volume}
    />{/if}

<style>
    .karaoke-cta {
        display: flex;
        width: 100%;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        border-radius: 9999px;
        padding: 0.7rem 1rem;
        font-size: 0.95rem;
        font-weight: 800;
        color: #fff;
        background: linear-gradient(
            110deg,
            #ff3d8b,
            color-mix(in srgb, var(--jam-accent, #1ed760) 70%, #ff3d8b),
            #8b5cf6
        );
        background-size: 200% 100%;
        box-shadow:
            0 6px 24px rgb(255 61 139 / 0.35),
            inset 0 1px 0 rgb(255 255 255 / 0.3);
        transition:
            transform 150ms ease,
            filter 150ms ease,
            background-position 600ms ease;
    }
    .karaoke-cta:hover:not(:disabled) {
        transform: translateY(-1px) scale(1.02);
        background-position: 100% 0;
        filter: brightness(1.1);
    }
    .karaoke-cta:active:not(:disabled) {
        transform: scale(0.98);
    }
    .karaoke-cta:disabled {
        opacity: 0.6;
        cursor: progress;
    }
    .karaoke-cta:focus-visible,
    .karaoke-secondary:focus-visible,
    .karaoke-clap:focus-visible,
    .karaoke-chip-button:focus-visible {
        outline: 2px solid #fff;
        outline-offset: 2px;
    }
    .karaoke-cta-icon {
        font-size: 1.2rem;
    }
    .karaoke-cta-pulse:not(:disabled) {
        animation: karaoke-cta-pulse 1.6s ease-in-out infinite;
    }
    .karaoke-secondary,
    .karaoke-clap {
        width: 100%;
        border-radius: 9999px;
        padding: 0.5rem 1rem;
        font-weight: 700;
        background: rgb(255 255 255 / 0.08);
        box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.15);
    }
    .karaoke-secondary:hover,
    .karaoke-clap:hover:not(:disabled) {
        background: rgb(255 255 255 / 0.16);
    }
    .karaoke-clap {
        background: rgb(255 209 102 / 0.15);
        box-shadow: inset 0 0 0 1px rgb(255 209 102 / 0.45);
    }
    .karaoke-clap:disabled {
        opacity: 0.5;
    }
    .karaoke-chip-button {
        border-radius: 9999px;
        padding: 0.2rem 0.6rem;
        font-size: 0.75rem;
        font-weight: 700;
        background: rgb(255 255 255 / 0.08);
    }
    .karaoke-chip-button:hover {
        background: rgb(255 255 255 / 0.18);
    }
    .karaoke-install {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        border-radius: 0.875rem;
        padding: 0.75rem;
        background: rgb(139 92 246 / 0.14);
        box-shadow: inset 0 0 0 1px rgb(139 92 246 / 0.45);
    }
    .karaoke-install-link {
        align-self: flex-start;
        border-radius: 9999px;
        padding: 0.35rem 0.9rem;
        font-size: 0.8rem;
        font-weight: 800;
        color: #fff;
        text-decoration: none;
        background: linear-gradient(110deg, #8b5cf6, #ff3d8b);
    }
    .karaoke-install-link:hover {
        filter: brightness(1.1);
    }
    .karaoke-install-link:focus-visible {
        outline: 2px solid #fff;
        outline-offset: 2px;
    }
    .karaoke-waiting {
        border-radius: 0.75rem;
        padding: 0.75rem;
        text-align: center;
        color: rgb(255 255 255 / 0.8);
        background: rgb(255 255 255 / 0.05);
    }
    .karaoke-onstage {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        border-radius: 0.875rem;
        padding: 0.6rem 0.75rem;
        background: linear-gradient(110deg, rgb(255 61 139 / 0.18), rgb(139 92 246 / 0.18));
        box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.1);
    }
    .karaoke-onstage-dot {
        width: 0.6rem;
        height: 0.6rem;
        flex-shrink: 0;
        border-radius: 9999px;
        background: rgb(255 255 255 / 0.3);
    }
    .karaoke-onstage-live {
        background: #ff3d8b;
        box-shadow: 0 0 10px #ff3d8b;
        animation: karaoke-blink 1.2s ease-in-out infinite;
    }
    .karaoke-applause {
        border-radius: 9999px;
        padding: 0.15rem 0.55rem;
        font-weight: 800;
        background: rgb(255 209 102 / 0.18);
    }
    .karaoke-live {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        border-radius: 9999px;
        padding: 0.6rem 1rem;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #ff3d8b;
        background: rgb(255 61 139 / 0.12);
        box-shadow: inset 0 0 0 1px rgb(255 61 139 / 0.5);
    }
    .karaoke-live-dot {
        width: 0.6rem;
        height: 0.6rem;
        border-radius: 9999px;
        background: #ff3d8b;
        animation: karaoke-blink 1s ease-in-out infinite;
    }
    @keyframes karaoke-cta-pulse {
        0%,
        100% {
            box-shadow:
                0 6px 24px rgb(255 61 139 / 0.35),
                0 0 0 0 rgb(255 61 139 / 0.45);
        }
        50% {
            box-shadow:
                0 6px 24px rgb(255 61 139 / 0.35),
                0 0 0 10px rgb(255 61 139 / 0);
        }
    }
    @keyframes karaoke-blink {
        50% {
            opacity: 0.35;
        }
    }
    @media (prefers-reduced-motion: reduce) {
        .karaoke-cta-pulse:not(:disabled),
        .karaoke-onstage-live,
        .karaoke-live-dot {
            animation: none;
        }
    }
</style>
