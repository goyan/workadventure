import {
    castLine,
    cellAt,
    emptyFishing,
    FISH_DEPTH_PX,
    reelLine,
    stepFishing,
    wireKindOf,
} from "@workadventure/map-editor";
import type { FishingEvent, FishingLineState, FishingState } from "@workadventure/map-editor";
import type { FishingEventMessage, FishingMessage } from "@workadventure/messages";
import { z } from "zod";
import type { VariablesRepositoryInterface } from "../Services/Repository/VariablesRepositoryInterface";
import type { LifeAtStep } from "./AquaticLifeManager";
import type { GameRoom } from "./GameRoom";

/** A cast is refused when the life of the room was not stepped for this long: its fish no longer move. */
const LIFE_STALE_MS = 3000;

const SavedFishing = z.object({ caughtTotal: z.number().int().min(0) });

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
 * Only the count of the catches is saved: a line does not survive a restart.
 */
export class FishingManager {
    private state: FishingState = emptyFishing();
    private life: LifeAtStep | undefined;
    private caughtTotal = 0;

    constructor(
        private readonly room: Pick<GameRoom, "sendSubMessageToRoom">,
        /** Where the players who may fish stand (those on the ground, where the water is), by user id. */
        private readonly anglers: () => ReadonlyMap<number, { x: number; y: number }>,
        private readonly store?: { repository: VariablesRepositoryInterface; roomUrl: string },
        private readonly now: () => number = Date.now,
        private readonly random: () => number = Math.random,
    ) {}

    /** Brings back the count of the catches. A store that does not answer must not keep the room closed. */
    public async restore(): Promise<void> {
        if (!this.store) return;
        try {
            const fields = await this.store.repository.loadVariables(this.hashKey());
            if (!fields.state) return;
            this.caughtTotal = SavedFishing.parse(JSON.parse(fields.state)).caughtTotal;
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

    /** Just before a step of the life of the room. */
    public beforeStep(life: LifeAtStep): void {
        this.life = life;
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
        return this.state.lines.size > 0 || this.caughtTotal > 0 ? this.message([]) : undefined;
    }

    private signature(): string {
        let signature = "";
        for (const line of this.state.lines.values()) {
            signature += `${line.userId}:${line.state}:${line.fishId ?? 0};`;
        }
        return signature;
    }

    private message(events: readonly FishingEvent[]): FishingMessage {
        return {
            lines: [...this.state.lines.values()].map((line) => ({
                userId: line.userId,
                x: Math.round(line.x),
                y: Math.round(line.y),
                state: STATE_ON_WIRE[line.state],
                fishId: line.fishId ?? 0,
            })),
            events: events.map(
                (event): FishingEventMessage => ({
                    userId: event.userId,
                    type: EVENT_ON_WIRE[event.type],
                    grams: event.type === "caught" ? event.grams : 0,
                    kind: event.type === "caught" ? wireKindOf("fish", event.sex) : 0,
                }),
            ),
            caughtTotal: this.caughtTotal,
        };
    }

    private tell(events: readonly FishingEvent[]): void {
        const caught = events.filter((event) => event.type === "caught").length;
        if (caught > 0) {
            this.caughtTotal += caught;
            this.save();
        }
        this.room.sendSubMessageToRoom({
            message: { $case: "fishingMessage", fishingMessage: this.message(events) },
        });
    }

    private save(): void {
        if (!this.store) return;
        this.store.repository
            .saveVariable(this.hashKey(), "state", JSON.stringify({ caughtTotal: this.caughtTotal }))
            .catch((error) => console.error("Could not save the fishing of the map", error));
    }

    private hashKey(): string {
        return `fishing:${this.store?.roomUrl ?? ""}`;
    }
}
