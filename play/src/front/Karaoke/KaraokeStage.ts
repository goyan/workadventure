import {
    KARAOKE_STAGE_STATE_EVENT,
    KARAOKE_STAGE_ACTION_EVENT,
    KaraokeStageStateSchema,
    KaraokeStageActionSchema,
    KaraokeStageAction,
    KaraokeReferenceSchema,
    KaraokeScoreReportSchema,
    KARAOKE_SCORE_EVENT,
    KARAOKE_LEADERBOARD_EVENT,
    KARAOKE_LEADERBOARD_REQUEST_EVENT,
    KaraokeSongLeaderboardSchema,
} from "@workadventure/map-editor";
import type {
    KaraokeStageState,
    KaraokeReference,
    KaraokeScoreReport,
    KaraokeSongLeaderboard,
} from "@workadventure/map-editor";
import { get, writable } from "svelte/store";
import type { Unsubscriber } from "svelte/store";
import type { HomeJamContext } from "../Spotify/HomeJam";
import type { JamRoom } from "../ListeningZone/ListeningZoneController";

export const karaokeStagesStore = writable<ReadonlyMap<string, KaraokeStageState>>(new Map());
export const karaokeScoresStore = writable<ReadonlyMap<string, KaraokeScoreReport>>(new Map());
/** The ranking of each song, by recording key: kept by the server, received when it changes or when asked for. */
export const karaokeLeaderboardsStore = writable<ReadonlyMap<string, KaraokeSongLeaderboard>>(new Map());
type StageContext = Pick<
    HomeJamContext,
    "rooms" | "localUuid" | "userByUuid" | "userById" | "send" | "onEvent" | "now"
>;
interface StageActions {
    enable(room: JamRoom, enabled: boolean): void;
    select(room: JamRoom, singerUuid: string | null): void;
    request(room: JamRoom, action: KaraokeStageAction): void;
    name(uuid: string): string;
    reference(room: JamRoom, reference: KaraokeReference): void;
    score(room: JamRoom, report: KaraokeScoreReport): void;
    leaderboard(recordingKey: string): void;
    lyrics(room: JamRoom, lyrics: NonNullable<KaraokeStageState["lyrics"]>): void;
}
let actions: StageActions | undefined;

export function setKaraokeReference(room: JamRoom, reference: KaraokeReference): void {
    actions?.reference(room, reference);
}
export function publishKaraokeScore(room: JamRoom, report: KaraokeScoreReport): void {
    actions?.score(room, report);
}

function saveScore(report: KaraokeScoreReport): void {
    karaokeScoresStore.update(
        (reports) =>
            new Map([
                ...[...reports]
                    .filter(
                        ([, previous]) => previous.hostUuid !== report.hostUuid || previous.turnId !== report.turnId,
                    )
                    .slice(-19),
                [report.turnId, report],
            ]),
    );
}

export function enableKaraokeGame(room: JamRoom, enabled: boolean): void {
    actions?.enable(room, enabled);
}
export function selectKaraokeSinger(room: JamRoom, singerUuid: string | null): void {
    actions?.select(room, singerUuid);
}
export function requestKaraokeTurn(room: JamRoom, action: KaraokeStageAction): void {
    if (action === KaraokeStageAction.Leave) {
        const stage = get(karaokeStagesStore).get(room.jam.hostUuid);
        const report = stage && get(karaokeScoresStore).get(stage.turnId);
        if (report) actions?.score(room, { ...report, finished: true });
    }
    actions?.request(room, action);
}
/** The host shares the synced lyrics Spotify shows them: every player follows the same timing. */
export function setKaraokeLyrics(room: JamRoom, lyrics: NonNullable<KaraokeStageState["lyrics"]>): void {
    actions?.lyrics(room, lyrics);
}
/** Asks the server for the ranking of a song; it answers only when the song has one. */
export function requestKaraokeLeaderboard(recordingKey: string): void {
    actions?.leaderboard(recordingKey);
}
export function karaokeSingerName(uuid: string): string {
    return actions?.name(uuid) ?? uuid;
}

function identity(room: JamRoom): Pick<KaraokeStageState, "areaId" | "propertyId" | "hostUuid"> {
    return { areaId: room.zone.areaId, propertyId: room.zone.propertyId, hostUuid: room.jam.hostUuid };
}
function matches(room: JamRoom, stage: Pick<KaraokeStageState, "areaId" | "propertyId" | "hostUuid">): boolean {
    return (
        room.zone.areaId === stage.areaId &&
        room.zone.propertyId === stage.propertyId &&
        room.jam.hostUuid === stage.hostUuid
    );
}

/** The host moderates one singer and a short queue; requests are authenticated by their server sender. */
export function startKaraokeStage(context: StageContext): Unsubscriber {
    const now = context.now ?? Date.now;
    const lastAction = new Map<string, number>();
    const clapped = new Set<string>();
    const roomFor = (stage: Pick<KaraokeStageState, "areaId" | "propertyId" | "hostUuid">): JamRoom | undefined =>
        get(context.rooms).find((room) => matches(room, stage));
    const current = (room: JamRoom): KaraokeStageState =>
        get(karaokeStagesStore).get(room.jam.hostUuid) ?? {
            ...identity(room),
            enabled: false,
            singerUuid: null,
            turnId: crypto.randomUUID(),
            queue: [],
            applause: 0,
        };
    const publish = (stage: KaraokeStageState): void => {
        karaokeStagesStore.update((stages) => new Map(stages).set(stage.hostUuid, stage));
        context.send(KARAOKE_STAGE_STATE_EVENT, stage, []);
    };
    const handle = (room: JamRoom, uuid: string, action: KaraokeStageAction, userId?: number): void => {
        const stage = current(room);
        if (action === KaraokeStageAction.Request) {
            context.send(KARAOKE_STAGE_STATE_EVENT, stage, userId === undefined ? [] : [userId]);
            return;
        }
        if (!stage.enabled) return;
        if (
            action === KaraokeStageAction.Join &&
            stage.queue.length < 20 &&
            stage.singerUuid !== uuid &&
            !stage.queue.includes(uuid)
        ) {
            publish(
                stage.singerUuid
                    ? { ...stage, queue: [...stage.queue, uuid] }
                    : {
                          ...stage,
                          singerUuid: uuid,
                          turnId: crypto.randomUUID(),
                          applause: 0,
                      },
            );
        } else if (action === KaraokeStageAction.Leave) {
            const queue = stage.queue.filter((queued) => queued !== uuid);
            const leaving = stage.singerUuid === uuid;
            publish({
                ...stage,
                singerUuid: leaving ? (queue[0] ?? null) : stage.singerUuid,
                queue: leaving ? queue.slice(1) : queue,
                turnId: leaving ? crypto.randomUUID() : stage.turnId,
                applause: leaving ? 0 : stage.applause,
            });
        } else if (
            action === KaraokeStageAction.Clap &&
            stage.singerUuid &&
            stage.singerUuid !== uuid &&
            !clapped.has(uuid)
        ) {
            clapped.add(uuid);
            publish({ ...stage, applause: Math.min(100_000, stage.applause + 1) });
        }
    };
    const localActions: StageActions = {
        reference(room, reference) {
            const parsed = KaraokeReferenceSchema.safeParse(reference);
            const stage = current(room);
            if (room.jam.hostUuid !== context.localUuid() || !parsed.success) return;
            publish({ ...stage, reference: parsed.data });
        },
        score(room, report) {
            const stage = current(room);
            if (
                !stage.enabled ||
                report.hostUuid !== room.jam.hostUuid ||
                report.singerUuid !== context.localUuid() ||
                report.singerUuid !== stage.singerUuid ||
                report.turnId !== stage.turnId ||
                report.referenceId !== stage.reference?.id
            )
                return;
            const parsed = KaraokeScoreReportSchema.safeParse(report);
            if (!parsed.success) return;
            saveScore(parsed.data);
            context.send(KARAOKE_SCORE_EVENT, parsed.data, []);
        },
        enable(room, enabled) {
            if (room.jam.hostUuid !== context.localUuid()) return;
            clapped.clear();
            publish({
                ...current(room),
                enabled,
                singerUuid: null,
                turnId: crypto.randomUUID(),
                queue: [],
                applause: 0,
            });
        },
        select(room, singerUuid) {
            if (room.jam.hostUuid !== context.localUuid()) return;
            const stage = current(room);
            if (
                !stage.enabled ||
                (singerUuid && singerUuid !== context.localUuid() && !stage.queue.includes(singerUuid))
            )
                return;
            clapped.clear();
            publish({
                ...stage,
                singerUuid,
                turnId: crypto.randomUUID(),
                queue: stage.queue.filter((uuid) => uuid !== singerUuid),
                applause: 0,
            });
        },
        request(room, action) {
            const uuid = context.localUuid();
            if (!uuid) return;
            if (room.jam.hostUuid === uuid) handle(room, uuid, action);
            else {
                const host = context.userByUuid(room.jam.hostUuid);
                if (host) context.send(KARAOKE_STAGE_ACTION_EVENT, { ...identity(room), action }, [host.id]);
            }
        },
        lyrics(room, lyrics) {
            if (room.jam.hostUuid !== context.localUuid()) return;
            const parsed = KaraokeStageStateSchema.shape.lyrics.safeParse(lyrics);
            if (parsed.success) publish({ ...current(room), lyrics: parsed.data });
        },
        leaderboard(recordingKey) {
            context.send(KARAOKE_LEADERBOARD_REQUEST_EVENT, { recordingKey }, []);
        },
        name(uuid) {
            return (
                context.userByUuid(uuid)?.name ??
                get(context.rooms).find((room) => room.jam.hostUuid === uuid)?.jam.hostName ??
                uuid
            );
        },
    };
    actions = localActions;
    const stopEvents = context.onEvent((name, data, senderId) => {
        if (name === KARAOKE_LEADERBOARD_EVENT && senderId === undefined) {
            const parsed = KaraokeSongLeaderboardSchema.safeParse(data);
            if (parsed.success) {
                karaokeLeaderboardsStore.update(
                    (boards) => new Map([...boards, [parsed.data.recordingKey, parsed.data]]),
                );
            }
            return;
        }
        if (senderId === undefined) return;
        const sender = context.userById(senderId);
        if (!sender) return;
        if (name === KARAOKE_SCORE_EVENT) {
            const parsed = KaraokeScoreReportSchema.safeParse(data);
            if (!parsed.success || parsed.data.singerUuid !== sender.uuid) return;
            const stage = get(karaokeStagesStore).get(parsed.data.hostUuid);
            if (
                stage?.enabled &&
                stage.singerUuid === sender.uuid &&
                stage.turnId === parsed.data.turnId &&
                stage.reference?.id === parsed.data.referenceId
            )
                saveScore(parsed.data);
        } else if (name === KARAOKE_STAGE_STATE_EVENT) {
            const parsed = KaraokeStageStateSchema.safeParse(data);
            if (!parsed.success || parsed.data.hostUuid !== sender.uuid || !roomFor(parsed.data)) return;
            karaokeStagesStore.update((stages) => new Map(stages).set(sender.uuid, parsed.data));
        } else if (name === KARAOKE_STAGE_ACTION_EVENT) {
            const parsed = KaraokeStageActionSchema.safeParse(data);
            if (!parsed.success || parsed.data.hostUuid !== context.localUuid()) return;
            const room = roomFor(parsed.data);
            const key = `${sender.uuid}:${parsed.data.action}`;
            if (!room || now() - (lastAction.get(key) ?? -Infinity) < 500) return;
            for (const [uuid, at] of lastAction) if (now() - at > 60_000) lastAction.delete(uuid);
            if (lastAction.size >= 4096) return;
            lastAction.set(key, now());
            handle(room, sender.uuid, parsed.data.action, senderId);
        }
    });
    const stopRooms = context.rooms.subscribe((rooms) => {
        karaokeStagesStore.update(
            (stages) => new Map([...stages].filter(([, stage]) => rooms.some((room) => matches(room, stage)))),
        );
    });
    const pruneQueue = setInterval(() => {
        const own = get(context.rooms).find((room) => room.jam.hostUuid === context.localUuid());
        const stage = own && get(karaokeStagesStore).get(own.jam.hostUuid);
        if (!stage?.enabled) return;
        const connected = (uuid: string): boolean =>
            uuid === context.localUuid() || context.userByUuid(uuid) !== undefined;
        const queue = stage.queue.filter(connected);
        const singerUuid = stage.singerUuid && connected(stage.singerUuid) ? stage.singerUuid : null;
        if (queue.length !== stage.queue.length || singerUuid !== stage.singerUuid)
            publish({ ...stage, queue, singerUuid });
    }, 2000);
    return () => {
        if (actions === localActions) actions = undefined;
        stopEvents();
        stopRooms();
        clearInterval(pruneQueue);
        karaokeStagesStore.set(new Map());
        karaokeScoresStore.set(new Map());
        karaokeLeaderboardsStore.set(new Map());
    };
}
