<script lang="ts">
    import { onDestroy, untrack } from "svelte";
    import type { Unsubscriber } from "svelte/store";
    import { KaraokeReferenceSchema, KaraokeReferenceSource } from "@workadventure/map-editor";
    import type { KaraokeNote, KaraokeScoreReport, KaraokeStageState } from "@workadventure/map-editor";
    import Debug from "debug";
    import { LL } from "../../../i18n/i18n-svelte";
    import { lyricsRecordingKey } from "../../../common/Lyrics";
    import type { JamRoom } from "../../ListeningZone/ListeningZoneController";
    import { isLocalUser } from "../../ListeningZone/ListeningZoneController";
    import { karaokePositionMs } from "../../Karaoke/JamKaraoke";
    import type { KaraokePlayback } from "../../Karaoke/JamKaraoke";
    import { parseUltraStar, sameKaraokeSong } from "../../Karaoke/UltraStar";
    import { watchKaraokePitch } from "../../Karaoke/KaraokePitch";
    import type { KaraokePitchFrame } from "../../Karaoke/KaraokePitch";
    import {
        appendReferenceNote,
        karaokeMultiplier,
        karaokePitchDistance,
        KaraokeScoring,
    } from "../../Karaoke/KaraokeScoring";
    import type { KaraokeScore } from "../../Karaoke/KaraokeScoring";
    import { enterKaraokeSinger } from "../../Karaoke/KaraokeGameStore";
    import { openKaraokeMicrophone } from "../../Karaoke/KaraokeMicrophone";
    import { appendKaraokeTrail, karaokeLiveVoiceStore } from "../../Karaoke/KaraokeShow";
    import { setKaraokeReference, publishKaraokeScore, karaokeScoresStore } from "../../Karaoke/KaraokeStage";
    import { requestedMicrophoneDeviceIdStore } from "../../Stores/MediaStore";
    import Button from "../UI/Button.svelte";
    import KaraokeLeaderboard from "./KaraokeLeaderboard.svelte";
    import { IconMicrophone, IconMusic } from "@wa-icons";

    let {
        room,
        mine,
        playback,
        stage,
        micStream,
    }: {
        room: JamRoom;
        mine: boolean;
        playback: KaraokePlayback;
        stage: KaraokeStageState;
        micStream?: MediaStream;
    } = $props();
    const logger = Debug("karaoke-score");
    let recordingKey = $derived(playback.track ? lyricsRecordingKey(playback.track) : "");
    let reference = $derived(stage.reference?.recordingKey === recordingKey ? stage.reference : undefined);
    let ownTurn = $derived(stage.singerUuid !== null && isLocalUser(stage.singerUuid));
    let preview = $state<MediaStream>();
    let referenceRecording = $state(false);
    let openingMic = $state(false);
    let error = $state("");
    let frame = $state<KaraokePitchFrame>({ midi: undefined, rms: 0 });
    let position = $state(0);
    let latency = $state(0);
    let score = $state<KaraokeScore>({ score: 0, accuracy: 0, coverage: 0, combo: 0 });
    let previewGeneration = 0;
    let recordedNotes = $state<KaraokeNote[]>([]);
    let previewKey = "";
    let cleanupPreviewFocus: Unsubscriber | undefined;
    let activeStream = $derived(micStream ?? preview);
    let target = $derived(reference?.notes.find((note) => position >= note.startMs && position < note.endMs));
    let report = $derived($karaokeScoresStore.get(stage.turnId));
    let shown = $derived(ownTurn && activeStream ? score : report?.referenceId === reference?.id ? report : undefined);
    let level = $derived(Math.min(100, Math.round(frame.rms * 500)));
    let matching = $derived(
        target && frame.midi !== undefined ? karaokePitchDistance(frame.midi, target.midi) : undefined,
    );
    let difference = $derived(
        target && frame.midi !== undefined ? ((((frame.midi - target.midi + 6) % 12) + 12) % 12) - 6 : 0,
    );
    function noteName(midi: number | undefined): string {
        if (midi === undefined) return "—";
        const notes = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
        return `${notes[((Math.round(midi) % 12) + 12) % 12]}${Math.floor(Math.round(midi) / 12) - 1}`;
    }
    function stopPreview(): void {
        previewGeneration++;
        preview?.getTracks().forEach((track) => track.stop());
        preview = undefined;
        openingMic = false;
        referenceRecording = false;
        cleanupPreviewFocus?.();
        cleanupPreviewFocus = undefined;
    }
    async function openPreview(record: boolean): Promise<void> {
        stopPreview();
        error = "";
        if (record && (!playback.track || !playback.playing || !playback.positionAt)) {
            error = $LL.spotify.karaoke.score.needPlayback();
            return;
        }
        const generation = previewGeneration;
        openingMic = true;
        recordedNotes = [];
        previewKey = recordingKey;
        if (record && micStream) {
            referenceRecording = true;
            openingMic = false;
            return;
        }
        try {
            const stream = await openKaraokeMicrophone(
                (constraints) => navigator.mediaDevices.getUserMedia(constraints),
                $requestedMicrophoneDeviceIdStore,
            );
            if (generation !== previewGeneration) {
                stream.getTracks().forEach((track) => track.stop());
                return;
            }
            cleanupPreviewFocus = enterKaraokeSinger();
            referenceRecording = record;
            preview = stream;
        } catch (cause: unknown) {
            if (generation === previewGeneration) error = $LL.spotify.karaoke.game.micError();
            logger("Microphone test failed", cause);
        } finally {
            if (generation === previewGeneration) openingMic = false;
        }
    }
    function saveReference(): void {
        const track = playback.track;
        const notes = recordedNotes;
        const key = previewKey;
        stopPreview();
        if (!track || key !== recordingKey) return;
        if (notes.reduce((sum, note) => sum + note.endMs - note.startMs, 0) < 500) {
            error = $LL.spotify.karaoke.score.shortReference();
            return;
        }
        const parsed = KaraokeReferenceSchema.safeParse({
            id: crypto.randomUUID(),
            recordingKey: key,
            title: track.title,
            artist: track.artist,
            source: KaraokeReferenceSource.Voice,
            notes,
        });
        if (!parsed.success) {
            error = $LL.spotify.karaoke.score.shortReference();
            return;
        }
        setKaraokeReference(room, parsed.data);
    }
    async function importChart(event: Event): Promise<void> {
        const input = event.currentTarget;
        if (!(input instanceof HTMLInputElement)) return;
        const file = input.files?.[0];
        input.value = "";
        const track = playback.track;
        const key = recordingKey;
        if (!file || !track) return;
        error = "";
        try {
            if (file.size > 300_000) throw new Error("Chart too large");
            const chart = parseUltraStar(await file.text(), key);
            if (key !== recordingKey) return;
            if (
                !sameKaraokeSong(chart.title, track.title) ||
                !sameKaraokeSong(chart.artist, track.artist.split(",")[0])
            ) {
                error = $LL.spotify.karaoke.score.wrongSong();
                return;
            }
            setKaraokeReference(room, chart);
        } catch (cause: unknown) {
            error = $LL.spotify.karaoke.score.invalid();
            logger("Chart import refused", cause);
        }
    }

    let previewOwner = $derived(`${recordingKey}|${stage.singerUuid ?? ""}`);
    $effect(() => {
        if (previewOwner) untrack(stopPreview);
    });
    $effect(() => {
        const timer = setInterval(() => {
            position = karaokePositionMs(playback, Date.now()) - latency;
        }, 100);
        return () => clearInterval(timer);
    });
    $effect(() => {
        const stream = activeStream;
        const referenceId = reference?.id;
        const turnId = stage.turnId;
        untrack(() => {
            frame = { midi: undefined, rms: 0 };
            score = { score: 0, accuracy: 0, coverage: 0, combo: 0 };
        });
        if (!stream) return;
        let alive = true;
        let cleanup: Unsubscriber | undefined;
        let lastSent = 0;
        let finished = false;
        let lastReport: KaraokeScoreReport | undefined;
        const melody = untrack(() => reference);
        const singer = untrack(() => (ownTurn && micStream === stream ? stage.singerUuid : null));
        const scoring = melody ? new KaraokeScoring(melody.notes) : undefined;
        let noteIndex = -1;
        let judgementId = 0;
        karaokeLiveVoiceStore.set({
            trail: [],
            midi: undefined,
            latencyMs: untrack(() => latency),
            judgements: new Map(),
            judged: undefined,
            streak: 0,
            multiplier: 1,
            score: 0,
        });
        watchKaraokePitch(stream, (value) => {
            if (!alive) return;
            frame = value;
            position = karaokePositionMs(playback, Date.now()) - latency;
            const expected = melody?.notes.find((note) => position >= note.startMs && position < note.endMs);
            const laneMidi =
                value.midi !== undefined && expected
                    ? expected.midi + (((((value.midi - expected.midi + 6) % 12) + 12) % 12) - 6)
                    : value.midi;
            karaokeLiveVoiceStore.update((live) => {
                if (!live) return live;
                const trail = appendKaraokeTrail(live.trail, { atMs: position, midi: laneMidi });
                if (!singer || !scoring || !playback.playing)
                    return { ...live, trail, midi: laneMidi, latencyMs: latency };
                const index = scoring.indexAt(position);
                if (index === noteIndex) return { ...live, trail, midi: laneMidi, latencyMs: latency };
                const passed = noteIndex;
                noteIndex = index;
                if (passed < 0) return { ...live, trail, midi: laneMidi, latencyMs: latency };
                const quality = scoring.judge(passed);
                const streak = scoring.streak();
                const multiplier = karaokeMultiplier(streak);
                const total = scoring.result().score;
                return {
                    trail,
                    midi: laneMidi,
                    latencyMs: latency,
                    judgements: new Map([...live.judgements, [passed, quality]]),
                    judged: {
                        index: passed,
                        quality,
                        id: ++judgementId,
                        gained: Math.max(0, total - live.score),
                        golden: melody?.notes[passed]?.golden ?? false,
                        broken: streak === 0 && live.multiplier > 1,
                        levelUp: multiplier > live.multiplier ? multiplier : undefined,
                    },
                    streak,
                    multiplier,
                    score: total,
                };
            });
            if (referenceRecording && playback.playing && previewKey === recordingKey)
                recordedNotes = appendReferenceNote(recordedNotes, position, value.midi);
            if (!singer || !scoring || !melody || !playback.positionAt || !playback.playing || finished) return;
            score = scoring.sample(position, value.midi);
            const end = melody.notes.at(-1)?.endMs ?? Infinity;
            const done = position >= end;
            if (done || Date.now() - lastSent >= 500) {
                lastSent = Date.now();
                finished = done;
                lastReport = {
                    ...score,
                    hostUuid: room.jam.hostUuid,
                    singerUuid: singer,
                    turnId,
                    referenceId: referenceId ?? melody.id,
                    finished: done,
                };
                publishKaraokeScore(room, lastReport);
            }
        })
            .then((stop) => {
                if (alive) cleanup = stop;
                else stop();
            })
            .catch((cause: unknown) => {
                if (alive) error = $LL.spotify.karaoke.game.micError();
                logger("Pitch analyzer failed", cause);
            });
        return () => {
            alive = false;
            cleanup?.();
            karaokeLiveVoiceStore.set(undefined);
            // The song changed or the stage moved on before its last note: what was sung is the result of the turn.
            const sung = lastReport;
            if (!finished && sung) untrack(() => publishKaraokeScore(room, { ...sung, finished: true }));
        };
    });
    onDestroy(stopPreview);
</script>

<section class="mt-3 space-y-2" aria-label={$LL.spotify.karaoke.score.title()} data-testid="karaoke-score">
    <div class="flex items-center justify-between gap-2 text-xs font-bold">
        <span class="flex items-center gap-1.5"><IconMusic font-size="16" />{$LL.spotify.karaoke.score.title()}</span>
        {#if reference}<span class="rounded-full bg-white/10 px-2 py-0.5 text-white/70"
                >{reference.source === KaraokeReferenceSource.UltraStar
                    ? $LL.spotify.karaoke.score.ultrastar()
                    : reference.source === KaraokeReferenceSource.Auto
                      ? $LL.spotify.karaoke.score.auto()
                      : $LL.spotify.karaoke.score.voice()}</span
            >{/if}
    </div>
    <div class="grid grid-cols-3 gap-1.5 rounded-xl bg-white/5 p-2 text-center" data-testid="karaoke-score-hud">
        <div>
            <span class="block text-[10px] text-white/70">{$LL.spotify.karaoke.score.score()}</span><strong
                class="text-xl tabular-nums text-[var(--jam-accent,#1ed760)]"
                >{shown?.score ?? (reference ? 0 : "—")}</strong
            ><span class="block text-[10px] text-white/60">/ 10 000</span>
        </div>
        <div>
            <span class="block text-[10px] text-white/70">{$LL.spotify.karaoke.score.accuracy()}</span><strong
                class="text-xl tabular-nums">{shown ? `${shown.accuracy}%` : "—"}</strong
            ><span class="block text-[10px] text-white/60"
                >{$LL.spotify.karaoke.score.coverage()} · {shown?.coverage ?? 0}%</span
            >
        </div>
        <div>
            <span class="block text-[10px] text-white/70">{$LL.spotify.karaoke.score.combo()}</span><strong
                class="text-xl tabular-nums">{shown?.combo ?? 0}<span class="text-xs">×</span></strong
            ><span class="block text-[10px] text-white/60">{report?.finished ? "🏆" : "🎶"}</span>
        </div>
    </div>
    <div class="rounded-xl border border-white/10 p-2" data-testid="karaoke-microphone">
        <div class="flex items-center justify-between gap-2 text-xs">
            <span class="flex items-center gap-1"
                ><IconMicrophone font-size="14" />{$LL.spotify.karaoke.score.microphone()}</span
            ><span>{activeStream ? noteName(frame.midi) : $LL.spotify.karaoke.score.micOff()}</span>
        </div>
        <div
            class="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10"
            role="meter"
            aria-label={$LL.spotify.karaoke.score.microphone()}
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={level}
        >
            <div class="h-full rounded-full bg-[var(--jam-accent,#1ed760)]" style:width={`${level}%`}></div>
        </div>
        {#if !micStream}
            <div class="mt-2">
                <Button
                    size="sm"
                    disabled={openingMic || referenceRecording}
                    onclick={() => (preview ? stopPreview() : openPreview(false))}
                    >{openingMic
                        ? $LL.spotify.karaoke.score.loadingMic()
                        : preview
                          ? $LL.spotify.karaoke.score.stopTest()
                          : $LL.spotify.karaoke.score.testMic()}</Button
                >
            </div>
        {/if}
        <p class="m-0 mt-1.5 text-[10px] text-white/60">
            {activeStream ? $LL.spotify.karaoke.score.isolation() : $LL.spotify.karaoke.score.micHint()}
        </p>
    </div>
    {#if reference}
        <div class="overflow-hidden rounded-xl bg-white/5 p-2">
            <div class="flex justify-between text-xs">
                <span>{$LL.spotify.karaoke.score.target()} <b>{noteName(target?.midi)}</b></span><span
                    >{$LL.spotify.karaoke.score.sung()} <b>{noteName(frame.midi)}</b></span
                >
            </div>
            <p class="m-0 text-center text-xs font-bold text-[var(--jam-accent,#1ed760)]" role="status">
                {report?.finished
                    ? $LL.spotify.karaoke.score.finished()
                    : !playback.playing
                      ? $LL.spotify.karaoke.score.pause()
                      : !activeStream
                        ? $LL.spotify.karaoke.score.waitingMic()
                        : !target
                          ? $LL.spotify.karaoke.score.rest()
                          : matching === undefined
                            ? $LL.spotify.karaoke.score.listening()
                            : matching < 0.5
                              ? $LL.spotify.karaoke.score.perfect()
                              : difference < 0
                                ? $LL.spotify.karaoke.score.higher()
                                : $LL.spotify.karaoke.score.lower()}
            </p>
        </div>
    {:else}<p class="m-0 text-xs text-white/70">
            {mine ? $LL.spotify.karaoke.score.noReference() : $LL.spotify.karaoke.score.guestReference()}
        </p>{/if}
    {#if mine}
        <details class="rounded-lg border border-white/10 p-2">
            <summary class="cursor-pointer text-xs font-bold"
                ><IconMusic font-size="13" class="inline" /> {$LL.spotify.karaoke.score.reference()}</summary
            >
            <label
                class="mt-2 block cursor-pointer rounded-lg border border-white/20 p-2 text-center text-xs hover:bg-white/10"
            >
                {$LL.spotify.karaoke.score.import()}
                <input
                    type="file"
                    accept=".txt,text/plain"
                    aria-label={$LL.spotify.karaoke.score.import()}
                    onchange={importChart}
                    disabled={!playback.track || referenceRecording}
                    class="mt-1 block w-full text-[10px]"
                    data-testid="karaoke-chart-import"
                />
            </label>
            {#if !stage.singerUuid || stage.singerUuid === room.jam.hostUuid}
                <div class="mt-2 flex flex-wrap gap-1.5">
                    {#if referenceRecording}<Button size="sm" onclick={saveReference}
                            >{$LL.spotify.karaoke.score.save()}</Button
                        ><Button size="sm" onclick={stopPreview}>{$LL.spotify.karaoke.score.cancel()}</Button>
                    {:else}<Button size="sm" disabled={openingMic} onclick={() => openPreview(true)}
                            >{$LL.spotify.karaoke.score.record()}</Button
                        >{/if}
                </div>
            {/if}
            {#if referenceRecording}<p class="m-0 mt-2 text-xs" role="status">
                    {$LL.spotify.karaoke.score.recording()} · {recordedNotes.length}
                </p>{/if}
        </details>
    {/if}
    <details class="text-xs text-white/70">
        <summary class="cursor-pointer">{$LL.spotify.karaoke.score.offset()}</summary>
        <label class="mt-2 block"
            >{$LL.spotify.karaoke.score.offset()} · {latency} ms<input
                type="range"
                min="-1000"
                max="1000"
                step="50"
                bind:value={latency}
                disabled={!!micStream}
                class="mt-1 w-full accent-[var(--jam-accent,#1ed760)]"
            /></label
        >
        <p class="m-0 text-[10px]">{$LL.spotify.karaoke.score.offsetHint()}</p>
    </details>
    {#if error}<p class="m-0 text-xs text-red-400" role="alert">{error}</p>{/if}
    <KaraokeLeaderboard {recordingKey} highlight={stage.singerUuid ?? undefined} />
</section>
