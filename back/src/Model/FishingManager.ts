import {
    betterRecord,
    castLine,
    cellAt,
    contestOver,
    contestRanking,
    emptyFishing,
    FISH_DEPTH_PX,
    recordCatch,
    reelLine,
    startContest,
    stepFishing,
    wireKindOf,
} from "@workadventure/map-editor";
import type {
    FishingContest,
    FishingContestPlayer,
    FishingEvent,
    FishingLineState,
    FishingRecord,
    FishingState,
} from "@workadventure/map-editor";
import type {
    FishingContestMessage,
    FishingEventMessage,
    FishingMessage,
    FishingRecordMessage,
} from "@workadventure/messages";
import { z } from "zod";
import type { VariablesRepositoryInterface } from "../Services/Repository/VariablesRepositoryInterface";
import type { LifeAtStep } from "./AquaticLifeManager";
import type { GameRoom } from "./GameRoom";

/** A cast is refused when the life of the room was not stepped for this long: its fish no longer move. */
const LIFE_STALE_MS = 3000;

const SavedFishing = z.object({
    caughtTotal: z.number().int().min(0),
    record: z
        .object({ name: z.string(), grams: z.number().int().min(0), female: z.boolean(), at: z.number() })
        .optional(),
});

/** A contest that could not start (one runs already, no such length, no life in the water), told to who asked. */
const CONTEST_REFUSED_ON_WIRE = 6;

const STATE_ON_WIRE: Record<FishingLineState, number> = { waiting: 0, bite: 1, reeling: 2 };
const EVENT_ON_WIRE: Record<FishingEvent["type"], number> = {
    bite: 0,
    missed: 1,
    lost: 2,
    retrieved: 3,
    refused: 4,
    caught: 5,
};

/**
 * The fishing lines of a room (the rules are in libs/map-editor, Life/Fishing). The server alone decides what a line
 * catches, so that every player sees the same fish bite and no browser can make up a catch. The lines are stepped
 * with the life of the water, just before it (see AquaticLifeManager): a line only tells a fish of the map where to
 * swim. The room is told all its lines whenever one changes; nothing is sent while nothing happens.
 *
 * A player may start a contest (see FishingContest in libs/map-editor): every catch made meanwhile counts for who
 * makes it, the ranking goes with every message, and the contest ends on time even when who started it left.
 *
 * Only the count of the catches and the record of the map are saved: neither a line nor a contest survives a restart.
 */
export class FishingManager {
    private state: FishingState = emptyFishing();
    private life: LifeAtStep | undefined;
    private caughtTotal = 0;
    private record: FishingRecord | undefined;
    private contest: FishingContest | undefined;
    /** The contest that just ended, while its final ranking is told. */
    private ended: FishingContest | undefined;
    /** The player of each key in the room, when they last caught a fish: a browser finds its own line of the ranking. */
    private readonly userIds = new Map<string, number>();

    constructor(
        private readonly room: Pick<GameRoom, "sendSubMessageToRoom">,
        /** Where the players who may fish stand (those on the ground, where the water is), by user id. */
        private readonly anglers: () => ReadonlyMap<number, { x: number; y: number }>,
        private readonly store?: { repository: VariablesRepositoryInterface; roomUrl: string },
        private readonly now: () => number = Date.now,
        private readonly random: () => number = Math.random,
        /** Who a player of the room is: a key that stays through a reconnection, and their name. */
        private readonly who: (userId: number) => FishingContestPlayer | undefined = () => undefined,
    ) {}

    /** Brings back the count of the catches. A store that does not answer must not keep the room closed. */
    public async restore(): Promise<void> {
        if (!this.store) return;
        try {
            const fields = await this.store.repository.loadVariables(this.hashKey());
            if (!fields.state) return;
            const saved = SavedFishing.parse(JSON.parse(fields.state));
            this.caughtTotal = saved.caughtTotal;
            this.record = saved.record;
        } catch (error) {
            console.error("Could not restore the fishing of the map", error);
        }
    }

    /** A player casts their line at a point of the map. */
    public cast(userId: number, x: number, y: number): void {
        const now = this.now();
        const life = this.life;
        const angler = this.anglers().get(userId);
        if (!life || now - life.now > LIFE_STALE_MS || !angler) {
            this.tell([{ type: "refused", userId }]);
            return;
        }
        const events = castLine(
            this.state,
            { userId, x, y, anglerX: angler.x, anglerY: angler.y },
            (pixelX, pixelY) => life.bodies.swimmable(cellAt(pixelX), cellAt(pixelY), FISH_DEPTH_PX),
            now,
        );
        this.tell(events);
    }

    /** The key again: hooks the fish that bites the line of the player, else brings the line back. */
    public reel(userId: number): void {
        if (!this.state.lines.has(userId)) return;
        this.tell(reelLine(this.state, userId, this.life?.animals ?? [], this.now()));
    }

    /**
     * A player starts a contest of 3, 5 or 10 minutes. Refused while one runs, and where no fish swims: only who
     * asked is told.
     */
    public startContest(userId: number, minutes: number): void {
        const now = this.now();
        const host = this.who(userId);
        const alive = this.life !== undefined && now - this.life.now <= LIFE_STALE_MS;
        const contest = !this.contest && host && alive ? startContest(host, minutes, now) : undefined;
        if (!contest) {
            this.send(this.message([], [{ userId, type: CONTEST_REFUSED_ON_WIRE, grams: 0, kind: 0 }]));
            return;
        }
        this.contest = contest;
        this.tell([]);
    }

    /** Just before a step of the life of the room. */
    public beforeStep(life: LifeAtStep): void {
        this.life = life;
        if (this.contest && contestOver(this.contest, this.now())) this.endContest();
        if (this.state.lines.size === 0 && this.state.wary.size === 0 && this.state.lastCast.size === 0) return;
        const before = this.signature();
        const events = stepFishing(
            this.state,
            life.animals,
            this.anglers(),
            life.maxSpeedPxPerS,
            life.now,
            this.random,
        );
        if (events.length > 0 || this.signature() !== before) this.tell(events);
    }

    /**
     * The life of the map stopped: no fish, no line. Turned off (`emptied`), the count of the catches starts over
     * with the life.
     */
    public lifeStopped(emptied: boolean): void {
        // No fish, no contest: it ends with what was caught.
        this.endContest();
        this.life = undefined;
        const counted = emptied && this.caughtTotal > 0;
        const had = this.state.lines.size > 0 || counted;
        this.state = emptyFishing();
        if (counted) {
            this.caughtTotal = 0;
            this.save();
        }
        if (had) this.tell([]);
    }

    /** The lines of the room and the count of its catches, for a player who joins. Undefined when nobody ever fished. */
    public snapshot(): FishingMessage | undefined {
        return this.state.lines.size > 0 || this.caughtTotal > 0 || this.contest || this.record
            ? this.message([])
            : undefined;
    }

    private signature(): string {
        let signature = "";
        for (const line of this.state.lines.values()) {
            signature += `${line.userId}:${line.state}:${line.fishId ?? 0};`;
        }
        return signature;
    }

    /** Ends the contest of the room: its final ranking is told once, then nothing of it is kept. */
    private endContest(): void {
        if (!this.contest) return;
        this.ended = this.contest;
        this.contest = undefined;
        this.tell([]);
        this.ended = undefined;
    }

    private contestMessage(): FishingContestMessage | undefined {
        const contest = this.contest ?? this.ended;
        if (!contest) return undefined;
        const finished = this.contest === undefined;
        return {
            hostName: contest.hostName,
            minutes: contest.minutes,
            remainingMs: finished ? 0 : Math.max(0, Math.round(contest.endsAt - this.now())),
            finished,
            entries: contestRanking(contest).map((entry) => ({
                name: entry.name,
                totalGrams: entry.totalGrams,
                bestGrams: entry.bestGrams,
                catches: entry.catches,
                userId: this.userIds.get(entry.key) ?? 0,
            })),
        };
    }

    private recordMessage(): FishingRecordMessage | undefined {
        const record = this.record;
        if (!record) return undefined;
        return {
            name: record.name,
            grams: record.grams,
            kind: wireKindOf("fish", record.female ? "female" : "male"),
            atSeconds: Math.floor(record.at / 1000),
        };
    }

    private message(events: readonly FishingEvent[], more: readonly FishingEventMessage[] = []): FishingMessage {
        return {
            lines: [...this.state.lines.values()].map((line) => ({
                userId: line.userId,
                x: Math.round(line.x),
                y: Math.round(line.y),
                state: STATE_ON_WIRE[line.state],
                fishId: line.fishId ?? 0,
            })),
            events: [
                ...events.map(
                    (event): FishingEventMessage => ({
                        userId: event.userId,
                        type: EVENT_ON_WIRE[event.type],
                        grams: event.type === "caught" ? event.grams : 0,
                        kind: event.type === "caught" ? wireKindOf("fish", event.sex) : 0,
                    }),
                ),
                ...more,
            ],
            caughtTotal: this.caughtTotal,
            contest: this.contestMessage(),
            record: this.recordMessage(),
        };
    }

    private tell(events: readonly FishingEvent[]): void {
        let caught = 0;
        const now = this.now();
        for (const event of events) {
            if (event.type !== "caught") continue;
            caught++;
            // A player who left the room as their fish came in has no name any more: the catch is only counted.
            const player = this.who(event.userId);
            if (!player) continue;
            this.userIds.set(player.key, event.userId);
            this.record = betterRecord(this.record, {
                name: player.name,
                grams: event.grams,
                female: event.sex === "female",
                at: now,
            });
            if (this.contest) recordCatch(this.contest, player, event.fishId, event.grams, now);
        }
        if (caught > 0) {
            this.caughtTotal += caught;
            this.save();
        }
        this.send(this.message(events));
    }

    private send(fishingMessage: FishingMessage): void {
        this.room.sendSubMessageToRoom({ message: { $case: "fishingMessage", fishingMessage } });
    }

    private save(): void {
        if (!this.store) return;
        this.store.repository
            .saveVariable(
                this.hashKey(),
                "state",
                JSON.stringify({ caughtTotal: this.caughtTotal, record: this.record }),
            )
            .catch((error) => console.error("Could not save the fishing of the map", error));
    }

    private hashKey(): string {
        return `fishing:${this.store?.roomUrl ?? ""}`;
    }
}
