<script lang="ts">
    import { onDestroy, onMount, untrack } from "svelte";
    import { Tween } from "svelte/motion";
    import { cubicOut } from "svelte/easing";
    import type { KaraokeReference, KaraokeScoreReport } from "@workadventure/map-editor";
    import { KARAOKE_MAX_MULTIPLIER, KARAOKE_MULTIPLIER_STEP } from "../../Karaoke/KaraokeScoring";
    import { LL } from "../../../i18n/i18n-svelte";
    import type { JamRoom } from "../../ListeningZone/ListeningZoneController";
    import { isLocalUser } from "../../ListeningZone/ListeningZoneController";
    import { controlJukeboxPlayback } from "../../Spotify/HomeJam";
    import { SpotifyPlaybackCommand } from "../../Interfaces/DesktopAppInterfaces";
    import { karaokePositionMs } from "../../Karaoke/JamKaraoke";
    import type { KaraokePlayback } from "../../Karaoke/JamKaraoke";
    import {
        karaokeLeaderboardsStore,
        karaokeScoresStore,
        karaokeSingerName,
        karaokeStagesStore,
        requestKaraokeLeaderboard,
        setKaraokeReference,
    } from "../../Karaoke/KaraokeStage";
    import { lyricsRecordingKey } from "../../../common/Lyrics";
    import type { LyricLine } from "../../Karaoke/Lrc";
    import { buildKaraokeMelody } from "../../Karaoke/SpotifyMelody";
    import type { DesktopSpotifyAnalysis } from "../../Interfaces/DesktopAppInterfaces";
    import {
        karaokeJudgement,
        karaokeLiveVoiceStore,
        karaokeRank,
        karaokeRankWindow,
        karaokeStars,
        KARAOKE_MEDALS,
        type KaraokeJudgement,
    } from "../../Karaoke/KaraokeShow";

    let {
        room,
        playback,
        playable,
        lines,
        analysis,
    }: {
        room: JamRoom;
        playback: KaraokePlayback;
        playable: boolean | undefined;
        lines: readonly LyricLine[];
        /** The host's analysis of the playing track (null for the other players). */
        analysis: DesktopSpotifyAnalysis | null;
    } = $props();

    const AHEAD_MS = 4000;
    /** When the intro shows its microphone, after 3, 2, 1: the host's jukebox starts the song there. */
    const INTRO_PLAY_MS = 3000;
    const HEIGHT = 112;
    const REDUCED_MOTION = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    let stage = $derived($karaokeStagesStore.get(room.jam.hostUuid));
    let recordingKey = $derived(playback.track ? lyricsRecordingKey(playback.track) : "");
    let reference = $derived(stage?.reference?.recordingKey === recordingKey ? stage.reference : undefined);
    let hosting = $derived(isLocalUser(room.jam.hostUuid));
    let live = $derived($karaokeLiveVoiceStore);
    let report = $derived(stage ? $karaokeScoresStore.get(stage.turnId) : undefined);

    let width = $state(600);
    let now = $state(Date.now());
    let position = $derived(karaokePositionMs(playback, now) - (live?.latencyMs ?? 0));
    let cursorX = $derived(Math.round(width * 0.22));
    let pxPerMs = $derived((width - cursorX) / AHEAD_MS);
    let range = $derived(
        reference?.notes.reduce(
            (value, note) => ({ min: Math.min(value.min, note.midi), max: Math.max(value.max, note.midi) }),
            { min: 72, max: 60 },
        ) ?? { min: 60, max: 72 },
    );
    let visibleNotes = $derived(
        reference?.notes
            .map((note, index) => ({ note, index }))
            .filter(({ note }) => note.endMs > position - cursorX / pxPerMs && note.startMs < position + AHEAD_MS) ??
            [],
    );
    let target = $derived(reference?.notes.find((note) => position >= note.startMs && position < note.endMs));
    let onTarget = $derived(
        target !== undefined && live?.midi !== undefined && Math.abs(live.midi - target.midi) < 0.75,
    );
    let trailPath = $derived(
        (live?.trail ?? [])
            .map((point, index, trail) => {
                if (point.midi === undefined) return "";
                const command = index > 0 && trail[index - 1].midi !== undefined ? "L" : "M";
                return `${command}${(x(point.atMs) + 0).toFixed(1)} ${(lane(point.midi) + 4).toFixed(1)}`;
            })
            .join(" "),
    );

    let intro = $state<{ name: string; mine: boolean; id: number }>();
    let particles = $state<{ id: number; left: number; delay: number; drift: number; emoji: string }[]>([]);
    let judgement = $state<{ kind: KaraokeJudgement; streak: number; id: number; gained: number; broken: boolean }>();
    let levelUp = $state<{ value: number; id: number }>();
    let sparkles = $state<{ id: number; angle: number; distance: number }[]>([]);
    const liveScore = new Tween(0, { duration: REDUCED_MOTION ? 0 : 450, easing: cubicOut });
    let multiplier = $derived(live?.multiplier ?? 1);
    let multiplierProgress = $derived(
        multiplier >= KARAOKE_MAX_MULTIPLIER
            ? 1
            : ((live?.streak ?? 0) % KARAOKE_MULTIPLIER_STEP) / KARAOKE_MULTIPLIER_STEP,
    );
    /** The songs of the references seen: a turn's results stay on its song after the next one started. */
    const songs: Record<string, Pick<KaraokeReference, "recordingKey" | "title" | "artist">> = {};
    $effect(() => {
        if (reference) songs[reference.id] = reference;
    });
    /** Latched when a turn finishes: the next song's first reports must not take the results away. */
    let results = $state<{
        report: KaraokeScoreReport;
        song: Pick<KaraokeReference, "recordingKey" | "title" | "artist">;
    }>();
    let shownFor = "";
    let board = $derived(results ? $karaokeLeaderboardsStore.get(results.song.recordingKey) : undefined);
    let standing = $derived(
        results
            ? karaokeRankWindow(board?.entries ?? [], {
                  singerUuid: results.report.singerUuid,
                  name: karaokeSingerName(results.report.singerUuid),
                  score: results.report.score,
                  accuracy: results.report.accuracy,
              })
            : undefined,
    );
    let newRecord = $derived(
        !!results &&
            board?.entries[0]?.singerUuid === results.report.singerUuid &&
            board.entries[0].score === results.report.score,
    );
    const shownScore = new Tween(0, { duration: REDUCED_MOTION ? 0 : 1800, easing: cubicOut });

    let timers: ReturnType<typeof setTimeout>[] = [];
    function later(run: () => void, ms: number): void {
        const timer = setTimeout(() => {
            timers = timers.filter((pending) => pending !== timer);
            run();
        }, ms);
        timers = [...timers, timer];
    }
    function x(atMs: number): number {
        return cursorX + (atMs - position) * pxPerMs;
    }
    function lane(midi: number): number {
        const span = Math.max(12, range.max - range.min);
        return 10 + (1 - (midi - range.min) / span) * (HEIGHT - 28);
    }
    function burst(count: number): void {
        const emojis = ["👏", "🎉", "✨", "🙌", "🔥"];
        const added = Array.from({ length: count }, (_, index) => ({
            id: Math.random(),
            left: 8 + Math.random() * 84,
            delay: index * 70,
            drift: (Math.random() - 0.5) * 60,
            emoji: emojis[Math.floor(Math.random() * emojis.length)],
        }));
        particles = [...particles, ...added];
        later(() => (particles = particles.filter((particle) => !added.includes(particle))), 2400 + count * 70);
    }

    let seenTurn: string | undefined;
    let mounted = false;
    $effect(() => {
        const turn = stage?.turnId;
        const singer = stage?.singerUuid ?? null;
        if (!mounted || turn === seenTurn) {
            seenTurn = turn;
            return;
        }
        seenTurn = turn;
        if (!singer) return;
        untrack(() => {
            const id = Math.random();
            intro = { name: karaokeSingerName(singer), mine: isLocalUser(singer), id };
            if (isLocalUser(room.jam.hostUuid)) {
                controlJukeboxPlayback(room, { command: SpotifyPlaybackCommand.Pause });
                controlJukeboxPlayback(room, { command: SpotifyPlaybackCommand.Seek, value: 0 });
                later(() => controlJukeboxPlayback(room, { command: SpotifyPlaybackCommand.Play }), INTRO_PLAY_MS);
            }
            later(() => {
                if (intro?.id === id) intro = undefined;
            }, 3800);
        });
    });

    let seenApplause: { turn: string; count: number } | undefined;
    $effect(() => {
        const turn = stage?.turnId ?? "";
        const count = stage?.applause ?? 0;
        const previous = seenApplause;
        seenApplause = { turn, count };
        if (!previous || previous.turn !== turn || count <= previous.count) return;
        untrack(() => burst(Math.min(14, (count - previous.count) * 5)));
    });

    $effect(() => {
        const score = live?.score ?? 0;
        untrack(() => {
            liveScore.set(score).catch(() => undefined);
        });
    });

    let seenJudgement = 0;
    $effect(() => {
        const judged = live?.judged;
        const streak = live?.streak ?? 0;
        if (!judged || judged.id === seenJudgement) return;
        seenJudgement = judged.id;
        untrack(() => {
            judgement = {
                kind: karaokeJudgement(judged.quality),
                streak,
                id: judged.id,
                gained: judged.gained,
                broken: judged.broken,
            };
            later(() => {
                if (judgement?.id === judged.id) judgement = undefined;
            }, 1100);
            if (judged.levelUp) {
                const up = { value: judged.levelUp, id: judged.id };
                levelUp = up;
                later(() => {
                    if (levelUp?.id === up.id) levelUp = undefined;
                }, 1300);
            }
            if (judged.golden && judged.quality >= 0.6 && !REDUCED_MOTION) {
                const added = Array.from({ length: 8 }, (_, index) => ({
                    id: Math.random(),
                    angle: index * 45 + Math.random() * 20,
                    distance: 26 + Math.random() * 18,
                }));
                sparkles = [...sparkles, ...added];
                later(() => (sparkles = sparkles.filter((sparkle) => !added.includes(sparkle))), 900);
            }
        });
    });

    $effect(() => {
        const finished = report?.finished ? report : undefined;
        const key = finished ? `${finished.turnId}|${finished.referenceId}` : "";
        const song = finished ? songs[finished.referenceId] : undefined;
        if (!finished || !song || key === shownFor) return;
        shownFor = key;
        untrack(() => {
            results = { report: finished, song };
            requestKaraokeLeaderboard(song.recordingKey);
            shownScore.set(0, { duration: 0 }).catch(() => undefined);
            shownScore.set(finished.score).catch(() => undefined);
            if (finished.score >= 5000) burst(14);
        });
        later(() => {
            if (shownFor === key) results = undefined;
        }, 15_000);
    });

    // The host's desktop app gives Spotify's analysis of each track: the stage gets a melody unless it has one.
    let builtFor = "";
    $effect(() => {
        const track = playback.track;
        const key = recordingKey;
        if (!hosting || !stage?.enabled || reference || !track?.uri || analysis?.uri !== track.uri) return;
        if (!lines.length || builtFor === key) return;
        builtFor = key;
        const melody = buildKaraokeMelody(analysis, lines, {
            recordingKey: key,
            title: track.title,
            artist: track.artist,
        });
        if (melody) untrack(() => setKaraokeReference(room, melody));
    });

    let frame = 0;
    onMount(() => {
        mounted = true;
        const tick = (): void => {
            now = Date.now();
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    });
    onDestroy(() => {
        for (const timer of timers) clearTimeout(timer);
    });

    const judgementText = (kind: KaraokeJudgement): string => $LL.spotify.karaoke.show.judgement[kind]();
</script>

{#if playable === false}
    <div class="karaoke-unplayable mx-4 mt-3 flex shrink-0 items-center gap-3 rounded-xl px-3 py-2" role="status">
        <span class="text-xl" aria-hidden="true">🎵</span>
        <span class="min-w-0 flex-1 text-xs font-bold">{$LL.spotify.karaoke.show.noKaraoke()}</span>
        {#if isLocalUser(room.jam.hostUuid)}<button
                type="button"
                class="shrink-0 rounded-full bg-white/15 px-3 py-1 text-xs font-bold hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                onclick={() => controlJukeboxPlayback(room, { command: SpotifyPlaybackCommand.Next })}
                data-testid="karaoke-skip">⏭ {$LL.spotify.karaoke.show.skip()}</button
            >{/if}
    </div>
{/if}
{#if reference}
    <div
        class="karaoke-highway relative mx-4 mt-3 shrink-0 overflow-hidden rounded-xl"
        bind:clientWidth={width}
        aria-hidden="true"
        data-testid="karaoke-highway"
    >
        <svg viewBox={`0 0 ${width} ${HEIGHT}`} class="block w-full" style:height={`${HEIGHT}px`}>
            <defs>
                <linearGradient id="karaoke-gold" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0" stop-color="#ffe08a" />
                    <stop offset="1" stop-color="#f5a623" />
                </linearGradient>
                <filter id="karaoke-glow" x="-50%" y="-200%" width="200%" height="500%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
            </defs>
            {#each [0.25, 0.5, 0.75] as row (row)}
                <line x1="0" x2={width} y1={HEIGHT * row} y2={HEIGHT * row} class="karaoke-staff" />
            {/each}
            {#each visibleNotes as { note, index } (index)}
                {@const judged = live?.judgements.get(index)}
                {@const left = x(note.startMs)}
                {@const right = x(note.endMs)}
                <rect
                    x={left}
                    y={lane(note.midi)}
                    width={Math.max(4, right - left)}
                    height="9"
                    rx="4.5"
                    class="karaoke-note"
                    class:karaoke-note-golden={note.golden}
                    class:karaoke-note-current={note === target}
                    class:karaoke-note-hit={judged !== undefined && judged >= 0.6}
                    class:karaoke-note-missed={judged !== undefined && judged < 0.3}
                    filter={note === target || note.golden ? "url(#karaoke-glow)" : undefined}
                />
            {/each}
            {#if trailPath}
                <path d={trailPath} class="karaoke-trail" filter="url(#karaoke-glow)" />
            {/if}
            <line x1={cursorX} x2={cursorX} y1="0" y2={HEIGHT} class="karaoke-cursor" />
            {#if live?.midi !== undefined}
                <circle
                    cx={cursorX}
                    cy={lane(live.midi) + 4.5}
                    r={onTarget ? 7 : 5}
                    class="karaoke-voice"
                    class:karaoke-voice-on={onTarget}
                    filter="url(#karaoke-glow)"
                />
            {/if}
        </svg>
        {#if live}
            <div class="karaoke-hud" data-testid="karaoke-live-score">
                <span class="karaoke-hud-score tabular-nums">{Math.round(liveScore.current)}</span>
                <span
                    class="karaoke-multiplier karaoke-multiplier-{multiplier}"
                    style:--karaoke-progress={`${Math.round(multiplierProgress * 100)}%`}
                    aria-label={$LL.spotify.karaoke.show.multiplier({ value: multiplier })}>×{multiplier}</span
                >
            </div>
        {/if}
        {#each sparkles as sparkle (sparkle.id)}
            <span
                class="karaoke-sparkle"
                style:left={`${cursorX}px`}
                style:--karaoke-angle={`${sparkle.angle}deg`}
                style:--karaoke-distance={`${sparkle.distance}px`}
                aria-hidden="true">✦</span
            >
        {/each}
        {#if levelUp}
            {#key levelUp.id}
                <div class="karaoke-level-up karaoke-multiplier-{levelUp.value}" role="status">
                    {$LL.spotify.karaoke.show.levelUp({ value: levelUp.value })}
                </div>
            {/key}
        {/if}
        {#if judgement}
            {#key judgement.id}
                <div class="karaoke-judgement karaoke-judgement-{judgement.kind}" role="status">
                    {#if judgement.gained > 0}<span class="karaoke-gained tabular-nums">+{judgement.gained}</span>{/if}
                    {judgement.broken ? $LL.spotify.karaoke.show.comboBroken() : judgementText(judgement.kind)}
                    {#if judgement.streak >= 3}<span class="karaoke-streak"
                            >{$LL.spotify.karaoke.show.streak({ count: judgement.streak })}</span
                        >{/if}
                </div>
            {/key}
        {/if}
    </div>
{/if}

<div class="pointer-events-none absolute inset-0 z-10 overflow-hidden">
    {#each particles as particle (particle.id)}
        <span
            class="karaoke-particle"
            style:left={`${particle.left}%`}
            style:animation-delay={`${particle.delay}ms`}
            style:--karaoke-drift={`${particle.drift}px`}>{particle.emoji}</span
        >
    {/each}
</div>

{#if stage?.enabled && stage.singerUuid && stage.queue.length}
    <div class="pointer-events-none absolute bottom-14 right-3 z-10" data-testid="karaoke-next-singer">
        <span class="karaoke-next-singer">
            🎤 {$LL.spotify.karaoke.show.nextSinger({ name: karaokeSingerName(stage.queue[0]) })}
        </span>
    </div>
{/if}

{#if intro}
    {#key intro.id}
        <div class="karaoke-intro absolute inset-0 z-20 flex flex-col items-center justify-center gap-2" role="status">
            <span class="karaoke-intro-label">{$LL.spotify.karaoke.show.upNext()}</span>
            <strong dir="auto" class="karaoke-intro-name">
                {intro.mine ? $LL.spotify.karaoke.show.you() : intro.name}
            </strong>
            <div class="karaoke-intro-count" aria-hidden="true">
                <span>3</span><span>2</span><span>1</span><span>🎤</span>
            </div>
        </div>
    {/key}
{/if}

{#if results}
    <div
        class="karaoke-results pointer-events-auto absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 px-6 text-center"
        role="dialog"
        aria-label={$LL.spotify.karaoke.show.results()}
        data-testid="karaoke-results"
    >
        <span class="karaoke-intro-label">{$LL.spotify.karaoke.show.results()}</span>
        <strong dir="auto" class="text-lg">{karaokeSingerName(results.report.singerUuid)}</strong>
        <span dir="auto" class="-mt-2 text-xs text-white/70">{results.song.title} · {results.song.artist}</span>
        <div class="karaoke-stars" aria-label={`${karaokeStars(results.report.score)} / 5`}>
            {#each [1, 2, 3, 4, 5] as star (star)}
                {@const value = karaokeStars(results.report.score)}
                <span
                    class="karaoke-star"
                    class:karaoke-star-full={value >= star}
                    class:karaoke-star-half={value === star - 0.5}
                    style:animation-delay={`${star * 160}ms`}>★</span
                >
            {/each}
        </div>
        <span class="karaoke-results-score tabular-nums">{Math.round(shownScore.current)}</span>
        {#if newRecord}<span class="karaoke-new-record" role="status">👑 {$LL.spotify.karaoke.show.newRecord()}</span
            >{/if}
        <span class="karaoke-rank">{$LL.spotify.karaoke.show.rank[karaokeRank(results.report.score)]()}</span>
        <p class="m-0 text-xs text-white/80">
            {$LL.spotify.karaoke.score.accuracy()} · {results.report.accuracy}% · {$LL.spotify.karaoke.score.combo()} · {results
                .report.combo}×
        </p>
        {#if standing}
            <ol class="m-0 flex w-full max-w-xs list-none flex-col gap-1 p-0 text-xs" data-testid="karaoke-standing">
                {#each standing.rows as row (row.rank)}
                    <li
                        class="flex items-center gap-2 rounded-lg px-2 py-1 {row.mine
                            ? 'karaoke-standing-mine font-bold'
                            : 'bg-white/5'}"
                    >
                        <span class="w-7 shrink-0 text-center tabular-nums"
                            >{row.mine && standing.beyond
                                ? `${row.rank}+`
                                : (KARAOKE_MEDALS[row.rank - 1] ?? row.rank)}</span
                        >
                        <span dir="auto" class="min-w-0 flex-1 truncate text-start">{row.name}</span>
                        <span class="shrink-0 tabular-nums text-white/70">{row.accuracy}%</span>
                        <b class="w-12 shrink-0 text-end tabular-nums">{row.score}</b>
                    </li>
                {/each}
            </ol>
        {/if}
        <button
            type="button"
            class="mt-1 rounded-full bg-white/15 px-4 py-1.5 text-sm font-bold hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            onclick={() => (results = undefined)}
            data-testid="karaoke-results-close">{$LL.spotify.karaoke.show.continue()}</button
        >
    </div>
{/if}

<style>
    .karaoke-highway {
        background:
            radial-gradient(
                120% 140% at 22% 50%,
                color-mix(in srgb, var(--jam-accent, #1ed760) 16%, transparent),
                transparent 60%
            ),
            rgb(0 0 0 / 0.35);
        box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.08);
    }
    .karaoke-unplayable {
        background: rgb(255 209 102 / 0.12);
        box-shadow: inset 0 0 0 1px rgb(255 209 102 / 0.4);
    }
    .karaoke-staff {
        stroke: rgb(255 255 255 / 0.07);
    }
    .karaoke-cursor {
        stroke: var(--jam-accent, #1ed760);
        stroke-width: 2;
        opacity: 0.8;
    }
    .karaoke-note {
        fill: color-mix(in srgb, var(--jam-accent, #1ed760) 55%, transparent);
        transition:
            fill 200ms ease,
            opacity 200ms ease;
    }
    .karaoke-note-current {
        fill: var(--jam-accent, #1ed760);
    }
    .karaoke-note-golden {
        fill: url(#karaoke-gold);
    }
    .karaoke-note-hit {
        fill: #fff;
    }
    .karaoke-note-golden.karaoke-note-hit {
        fill: #ffe08a;
    }
    .karaoke-note-missed {
        opacity: 0.25;
    }
    .karaoke-trail {
        fill: none;
        stroke: #fff;
        stroke-width: 3;
        stroke-linecap: round;
        stroke-linejoin: round;
        opacity: 0.85;
    }
    .karaoke-voice {
        fill: #fff;
        transition: r 120ms ease;
    }
    .karaoke-voice-on {
        fill: #ffe08a;
    }
    .karaoke-judgement {
        position: absolute;
        right: 0.75rem;
        top: 0.5rem;
        display: flex;
        align-items: baseline;
        gap: 0.5rem;
        font-size: 1.25rem;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        text-shadow: 0 2px 12px rgb(0 0 0 / 0.6);
        animation: karaoke-pop 1100ms ease-out forwards;
    }
    .karaoke-hud {
        position: absolute;
        left: 0.75rem;
        top: 0.4rem;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        pointer-events: none;
    }
    .karaoke-hud-score {
        font-size: 1.6rem;
        font-weight: 900;
        line-height: 1;
        color: #fff;
        text-shadow: 0 2px 10px rgb(0 0 0 / 0.6);
    }
    .karaoke-multiplier {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 2.4rem;
        border-radius: 9999px;
        padding: 0.1rem 0.5rem;
        font-size: 0.95rem;
        font-weight: 900;
        color: #fff;
        background:
            linear-gradient(90deg, rgb(255 255 255 / 0.28) var(--karaoke-progress, 0%), transparent 0) border-box,
            rgb(255 255 255 / 0.12);
        box-shadow: inset 0 0 0 2px rgb(255 255 255 / 0.25);
        transition:
            background 200ms ease,
            box-shadow 200ms ease;
    }
    .karaoke-multiplier-2 {
        color: #0d1f12;
        background:
            linear-gradient(90deg, rgb(255 255 255 / 0.35) var(--karaoke-progress, 0%), transparent 0),
            var(--jam-accent, #1ed760);
        box-shadow: 0 0 12px color-mix(in srgb, var(--jam-accent, #1ed760) 70%, transparent);
    }
    .karaoke-multiplier-3 {
        background: linear-gradient(90deg, rgb(255 255 255 / 0.3) var(--karaoke-progress, 0%), transparent 0), #ff3d8b;
        box-shadow: 0 0 14px rgb(255 61 139 / 0.8);
    }
    .karaoke-multiplier-4 {
        color: #2a1a00;
        background: linear-gradient(110deg, #ffe08a, #f5a623, #ffe08a);
        background-size: 200% 100%;
        box-shadow: 0 0 18px rgb(255 209 102 / 0.9);
        animation: karaoke-shine 1.2s linear infinite;
    }
    .karaoke-level-up {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 2rem;
        font-weight: 900;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        pointer-events: none;
        background: transparent;
        box-shadow: none;
        text-shadow:
            0 0 20px currentColor,
            0 3px 0 rgb(0 0 0 / 0.5);
        animation: karaoke-level-up 1300ms ease-out forwards;
    }
    .karaoke-level-up.karaoke-multiplier-2 {
        color: var(--jam-accent, #1ed760);
    }
    .karaoke-level-up.karaoke-multiplier-3 {
        color: #ff3d8b;
    }
    .karaoke-level-up.karaoke-multiplier-4 {
        color: #ffd166;
        animation: karaoke-level-up 1300ms ease-out forwards;
    }
    .karaoke-gained {
        font-size: 0.95rem;
        color: #fff;
    }
    .karaoke-sparkle {
        position: absolute;
        top: 50%;
        color: #ffe08a;
        font-size: 0.9rem;
        text-shadow: 0 0 8px #ffd166;
        pointer-events: none;
        animation: karaoke-sparkle 900ms ease-out forwards;
    }
    .karaoke-judgement-perfect {
        color: #ffe08a;
    }
    .karaoke-judgement-great {
        color: var(--jam-accent, #1ed760);
    }
    .karaoke-judgement-good {
        color: #fff;
    }
    .karaoke-judgement-miss {
        color: rgb(255 255 255 / 0.5);
    }
    .karaoke-streak {
        font-size: 0.8rem;
        color: #fff;
    }
    .karaoke-particle {
        position: absolute;
        bottom: -2rem;
        font-size: 1.75rem;
        animation: karaoke-float 2400ms ease-out forwards;
        opacity: 0;
    }
    .karaoke-next-singer {
        display: inline-flex;
        border-radius: 9999px;
        padding: 0.25rem 0.75rem;
        font-size: 0.75rem;
        font-weight: 700;
        background: rgb(0 0 0 / 0.55);
        box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--jam-accent, #1ed760) 50%, transparent);
    }
    .karaoke-intro,
    .karaoke-results {
        background: radial-gradient(
            circle at 50% 45%,
            color-mix(in srgb, var(--jam-accent, #1ed760) 30%, rgb(0 0 0 / 0.75)),
            rgb(0 0 0 / 0.85) 70%
        );
        backdrop-filter: blur(6px);
    }
    .karaoke-intro {
        animation: karaoke-intro 3800ms ease forwards;
    }
    .karaoke-intro-label {
        font-size: 0.75rem;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.2em;
        color: var(--jam-accent, #1ed760);
    }
    .karaoke-intro-name {
        font-size: clamp(1.75rem, 5vw, 2.75rem);
        line-height: 1.1;
        text-shadow: 0 0 24px color-mix(in srgb, var(--jam-accent, #1ed760) 70%, transparent);
    }
    .karaoke-intro-count {
        position: relative;
        height: 3.5rem;
        width: 4rem;
    }
    .karaoke-intro-count span {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 2.75rem;
        font-weight: 900;
        opacity: 0;
        animation: karaoke-count 800ms ease-out forwards;
    }
    .karaoke-intro-count span:nth-child(1) {
        animation-delay: 600ms;
    }
    .karaoke-intro-count span:nth-child(2) {
        animation-delay: 1400ms;
    }
    .karaoke-intro-count span:nth-child(3) {
        animation-delay: 2200ms;
    }
    .karaoke-intro-count span:nth-child(4) {
        animation-delay: 3000ms;
    }
    .karaoke-results {
        animation: karaoke-fade 300ms ease-out;
    }
    .karaoke-stars {
        display: flex;
        gap: 0.25rem;
        font-size: 2rem;
    }
    .karaoke-star {
        color: rgb(255 255 255 / 0.2);
        animation: karaoke-star 500ms ease-out both;
    }
    .karaoke-star-full {
        color: #ffd166;
        text-shadow: 0 0 14px rgb(255 209 102 / 0.8);
    }
    .karaoke-star-half {
        background: linear-gradient(90deg, #ffd166 50%, rgb(255 255 255 / 0.2) 50%);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
    }
    .karaoke-results-score {
        font-size: 3rem;
        font-weight: 900;
        line-height: 1;
        color: var(--jam-accent, #1ed760);
    }
    .karaoke-new-record {
        border-radius: 9999px;
        padding: 0.2rem 0.8rem;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: #1a1a1a;
        background: linear-gradient(110deg, #ffe08a, #f5a623);
        box-shadow: 0 0 18px rgb(255 209 102 / 0.7);
        animation: karaoke-pop-in 600ms ease-out both;
    }
    @keyframes karaoke-pop-in {
        from {
            opacity: 0;
            transform: scale(0.3) rotate(-8deg);
        }
    }
    .karaoke-standing-mine {
        background: linear-gradient(110deg, rgb(255 61 139 / 0.35), rgb(139 92 246 / 0.35));
        box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.35);
    }
    .karaoke-rank {
        font-size: 1rem;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.08em;
    }
    @keyframes karaoke-shine {
        to {
            background-position: -200% 0;
        }
    }
    @keyframes karaoke-level-up {
        0% {
            opacity: 0;
            transform: scale(0.4);
        }
        25% {
            opacity: 1;
            transform: scale(1.25);
        }
        45% {
            transform: scale(1);
        }
        80% {
            opacity: 1;
        }
        100% {
            opacity: 0;
            transform: scale(1.1) translateY(-8px);
        }
    }
    @keyframes karaoke-sparkle {
        0% {
            opacity: 1;
            transform: translate(-50%, -50%) rotate(var(--karaoke-angle)) translateX(0) scale(1.2);
        }
        100% {
            opacity: 0;
            transform: translate(-50%, -50%) rotate(var(--karaoke-angle)) translateX(var(--karaoke-distance)) scale(0.4);
        }
    }
    @keyframes karaoke-pop {
        0% {
            opacity: 0;
            transform: scale(0.6) translateY(6px);
        }
        20% {
            opacity: 1;
            transform: scale(1.15);
        }
        35% {
            transform: scale(1);
        }
        80% {
            opacity: 1;
        }
        100% {
            opacity: 0;
            transform: translateY(-10px);
        }
    }
    @keyframes karaoke-float {
        0% {
            opacity: 0;
            transform: translate(0, 0) scale(0.6);
        }
        15% {
            opacity: 1;
        }
        100% {
            opacity: 0;
            transform: translate(var(--karaoke-drift, 0), -18rem) scale(1.2) rotate(20deg);
        }
    }
    @keyframes karaoke-intro {
        0% {
            opacity: 0;
        }
        8%,
        88% {
            opacity: 1;
        }
        100% {
            opacity: 0;
        }
    }
    @keyframes karaoke-count {
        0% {
            opacity: 0;
            transform: scale(2.2);
        }
        25% {
            opacity: 1;
            transform: scale(1);
        }
        80% {
            opacity: 1;
        }
        100% {
            opacity: 0;
            transform: scale(0.8);
        }
    }
    @keyframes karaoke-star {
        from {
            opacity: 0;
            transform: scale(0.2) rotate(-40deg);
        }
    }
    @keyframes karaoke-fade {
        from {
            opacity: 0;
        }
    }
    @media (prefers-reduced-motion: reduce) {
        .karaoke-judgement,
        .karaoke-intro,
        .karaoke-star,
        .karaoke-multiplier-4 {
            animation: none;
        }
        .karaoke-level-up {
            animation: none;
        }
        .karaoke-particle,
        .karaoke-intro-count span {
            display: none;
        }
    }
</style>
