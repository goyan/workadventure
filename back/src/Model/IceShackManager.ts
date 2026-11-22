import {
    ICE_SHACK_CRACK_MS,
    ICE_SHACK_REACH_PX,
    ICE_SHACK_SEAT_TOLERANCE_PX,
    iceShackAbandoned,
    iceShackAt,
    iceShackEventOnWire,
    iceShackIce,
    iceShackPlacement,
    iceShackReady,
    iceShackSeat,
    iceShackSite,
    poolCells,
    stepIceShackIce,
} from "@workadventure/map-editor";
import type {
    IceShack,
    IceShackEvent,
    IceShackGround,
    PoolStyle,
    TerrainData,
    WaterGrid,
} from "@workadventure/map-editor";
import { IceShackAction } from "@workadventure/messages";
import type { IceShackEventMessage, IceShacksMessage } from "@workadventure/messages";
import { z } from "zod";
import type { VariablesRepositoryInterface } from "../Services/Repository/VariablesRepositoryInterface";
import type { GameRoom } from "./GameRoom";

/** The ice under the shacks is looked at this often (ms). */
const STEP_MS = 2000;
/** The time who put a shack up was last seen in the room is saved at most this often (ms). */
const SEEN_SAVED_EVERY_MS = 60_000;

/** A player of the room, as the shacks see them: where they stand (map pixels, as the fishing lines are cast). */
export interface IceShackPlayer {
    id: number;
    /** A key that stays through a reconnection (their uuid). */
    key: string;
    name: string;
    x: number;
    y: number;
    /** The altitude of the floor they stand on: 0 on the ground, where the ice is. */
    floorZ: number;
}

/** The cells of the pools of a relief, read again when the relief or the styles of its pools change. */
const poolsOfTerrain = new WeakMap<TerrainData, { styles: unknown; cells: Set<string> }>();

/**
 * The ground the shacks of a room go up on: the ice the meadow keeps, the water of the relief, its pools. Undefined
 * on a map without water.
 */
export function iceShackGround(
    wam: { terrain?: TerrainData; settings?: { pools?: PoolStyle[] } } | undefined,
    grid: Pick<WaterGrid, "depthAt"> | undefined,
    ice: { iceAt(tileX: number, tileY: number): number },
): IceShackGround | undefined {
    const terrain = wam?.terrain;
    if (!grid || !terrain) return undefined;
    const styles = wam.settings?.pools;
    let pools = poolsOfTerrain.get(terrain);
    if (!pools || pools.styles !== styles) {
        pools = { styles, cells: new Set(poolCells(terrain, styles).map((cell) => `${cell.cellX},${cell.cellY}`)) };
        poolsOfTerrain.set(terrain, pools);
    }
    const cells = pools.cells;
    return {
        iceMmAt: (tileX, tileY) => ice.iceAt(tileX, tileY),
        depthPxAt: (cellX, cellY) => grid.depthAt(cellX, cellY),
        inPool: (cellX, cellY) => cells.has(`${cellX},${cellY}`),
    };
}

const SavedShack = z.object({
    id: z.number().int().min(1),
    x: z.number().finite(),
    y: z.number().finite(),
    ownerKey: z.string(),
    ownerName: z.string(),
    builtAt: z.number().finite(),
    ownerSeenAt: z.number().finite(),
});
const SavedShacks = z.object({ shacks: z.array(SavedShack).max(64), nextId: z.number().int().min(1) });

/**
 * The ice fishing shacks of a room (the rules are in libs/map-editor, Life/IceShack). The server alone decides where
 * a shack may go up, on the ice it keeps (the same for every player who follows its weather), and who sits in it; the
 * room is told all its shacks whenever one changes, and a player who joins is told them all. A shack is an object of
 * the room, not an edit of the map: nothing is written in the WAM.
 *
 * The shacks are saved in their own Redis hash, as the states of the switched objects: they stay through a restart
 * and an empty room. Who sits in one is not saved. A shack goes when the ice under it thaws too thin (it cracks a
 * while first) or melts away, when who put it up takes it down, or when they stayed away a day.
 *
 * The fishing in a shack is an ordinary fishing line cast through its hole (see FishingManager): the fish that bite
 * are the fish of the room under the ice, and a catch counts as any other.
 */
export class IceShackManager {
    private shacks: IceShack[] = [];
    private nextId = 1;
    /** Who sits in each shack, by its id. */
    private readonly occupants = new Map<number, number>();
    private timer: ReturnType<typeof setInterval> | undefined;
    private savedSeenAt = 0;
    private sentSignature = "";
    private catchingUp: () => boolean = () => false;

    constructor(
        private readonly room: Pick<GameRoom, "sendSubMessageToRoom">,
        /** The ice and the water the server keeps; undefined while the map has none. */
        private readonly ground: () => IceShackGround | undefined,
        /** The players of the room, by user id. */
        private readonly players: () => ReadonlyMap<number, IceShackPlayer>,
        /** Where the objects of the map are placed. */
        private readonly objects: () => readonly { x: number; y: number }[],
        private readonly store?: { repository: VariablesRepositoryInterface; roomUrl: string },
        private readonly now: () => number = Date.now,
    ) {}

    /** While the room lives the time it missed (the meadow catches up), its ice is not the ice of now: not judged. */
    public catchUpWith(catchingUp: () => boolean): void {
        this.catchingUp = catchingUp;
    }

    /** Brings the shacks back. A store that does not answer must not keep the room closed. */
    public async restore(): Promise<void> {
        if (!this.store) return;
        try {
            const fields = await this.store.repository.loadVariables(this.hashKey());
            if (!fields.state) return;
            const saved = SavedShacks.parse(JSON.parse(fields.state));
            this.shacks = saved.shacks;
            this.nextId = Math.max(saved.nextId, ...saved.shacks.map((shack) => shack.id + 1));
        } catch (error) {
            console.error("Could not restore the ice fishing shacks of the map", error);
        }
    }

    public start(): void {
        this.stop();
        this.timer = setInterval(() => {
            try {
                this.step();
            } catch (error) {
                console.error("The ice fishing shacks of the map stopped", error);
                this.stop();
            }
        }, STEP_MS);
    }

    public stop(): void {
        if (this.timer) clearInterval(this.timer);
        this.timer = undefined;
    }

    /** What a player does with a shack. Anything that is refused is told to the room with its reason. */
    public act(userId: number, action: IceShackAction, shackId: number): void {
        const player = this.players().get(userId);
        if (!player) return;
        switch (action) {
            case IceShackAction.ICE_SHACK_BUILD:
                this.build(player);
                return;
            case IceShackAction.ICE_SHACK_ENTER:
                this.enter(player, shackId);
                return;
            case IceShackAction.ICE_SHACK_LEAVE:
                if (this.occupants.get(shackId) === userId) {
                    this.occupants.delete(shackId);
                    this.tell([{ userId, shackId, type: "left" }]);
                }
                return;
            case IceShackAction.ICE_SHACK_DISMANTLE:
                this.dismantle(player, shackId);
                return;
            default:
                return;
        }
    }

    /** A player left the room: they sit in no shack any more. */
    public userLeft(userId: number): void {
        let changed = false;
        for (const [shackId, occupant] of this.occupants) {
            if (occupant !== userId) continue;
            this.occupants.delete(shackId);
            changed = true;
        }
        // Who put a shack up is no longer in the room: its message says so.
        if (changed || this.shacks.some((shack) => this.ownerIdOf(shack, userId) === userId)) this.tell([], userId);
    }

    /**
     * Looks at the ice under each shack, at who sits in it, and at who put it up: a shack whose ice thawed cracks,
     * then goes; one whose builder stayed away a day goes. The room is told only what changed.
     */
    public step(): void {
        const now = this.now();
        const players = this.players();
        const events: { userId: number; shackId: number; type: IceShackEvent }[] = [];
        let removed = false;
        // Who sits in a shack and moved off its stool got up.
        for (const [shackId, occupant] of this.occupants) {
            const shack = this.shacks.find((candidate) => candidate.id === shackId);
            const player = players.get(occupant);
            if (!shack || !player || !this.onStool(shack, player)) this.occupants.delete(shackId);
        }
        let seen = false;
        for (const shack of this.shacks) {
            for (const player of players.values()) {
                if (player.key !== shack.ownerKey) continue;
                shack.ownerSeenAt = now;
                seen = true;
            }
        }
        const ground = this.ground();
        const judged = !this.catchingUp();
        for (const shack of [...this.shacks]) {
            if (iceShackAbandoned(shack, now)) {
                this.remove(shack);
                events.push({ userId: 0, shackId: shack.id, type: "abandoned" });
                removed = true;
                continue;
            }
            if (!judged) continue;
            const wasCracking = shack.crackingSince !== undefined;
            const state = stepIceShackIce(shack, ground ? iceShackIce(shack, ground) : 0, now);
            if (state === "collapse") {
                this.remove(shack);
                events.push({ userId: 0, shackId: shack.id, type: "collapsed" });
                removed = true;
            } else if (state === "cracking" && !wasCracking) {
                // Whoever sits in it gets out at once: the ice cracks under them.
                const occupant = this.occupants.get(shack.id) ?? 0;
                this.occupants.delete(shack.id);
                events.push({ userId: occupant, shackId: shack.id, type: "cracking" });
            }
        }
        if (removed || (seen && now - this.savedSeenAt >= SEEN_SAVED_EVERY_MS)) this.save();
        if (events.length > 0 || this.signature() !== this.sentSignature) this.tell(events);
    }

    /** The shacks of the room, for a player who joins. Undefined when there is none. */
    public snapshot(): IceShacksMessage | undefined {
        return this.shacks.length > 0 ? this.message([]) : undefined;
    }

    private build(player: IceShackPlayer): void {
        const refuse = (type: IceShackEvent): void => this.tell([{ userId: player.id, shackId: 0, type }]);
        if (player.floorZ !== 0) return refuse("notOnGround");
        const hole = iceShackAt(player);
        const ground = this.ground();
        const site = ground ? iceShackSite(hole, ground) : "noIce";
        if (site !== "ok") return refuse(site);
        const placement = iceShackPlacement(this.shacks, hole, player.key, this.objects());
        if (placement) return refuse(placement);
        const now = this.now();
        const shack: IceShack = {
            id: this.nextId++,
            x: hole.x,
            y: hole.y,
            ownerKey: player.key,
            ownerName: player.name,
            builtAt: now,
            ownerSeenAt: now,
        };
        this.shacks.push(shack);
        // Who drills the hole sits on the stool once the shack is up: they stand there already.
        this.leaveAll(player.id);
        this.occupants.set(shack.id, player.id);
        this.save();
        this.tell([{ userId: player.id, shackId: shack.id, type: "built" }]);
    }

    private enter(player: IceShackPlayer, shackId: number): void {
        const refuse = (type: IceShackEvent): void => this.tell([{ userId: player.id, shackId, type }]);
        const shack = this.shacks.find((candidate) => candidate.id === shackId);
        if (!shack) return refuse("unknown");
        const occupant = this.occupants.get(shackId);
        if (occupant === player.id) return;
        if (occupant !== undefined) return refuse("occupied");
        if (!iceShackReady(shack, this.now())) return refuse("notReady");
        if (shack.crackingSince !== undefined) return refuse("thinIce");
        if (!this.nearStool(shack, player)) return refuse("tooFar");
        this.leaveAll(player.id);
        this.occupants.set(shackId, player.id);
        this.tell([{ userId: player.id, shackId, type: "entered" }]);
    }

    private dismantle(player: IceShackPlayer, shackId: number): void {
        const refuse = (type: IceShackEvent): void => this.tell([{ userId: player.id, shackId, type }]);
        const shack = this.shacks.find((candidate) => candidate.id === shackId);
        if (!shack) return refuse("unknown");
        if (shack.ownerKey !== player.key) return refuse("notOwner");
        if (!this.nearStool(shack, player)) return refuse("tooFar");
        this.remove(shack);
        this.save();
        this.tell([{ userId: player.id, shackId, type: "dismantled" }]);
    }

    private remove(shack: IceShack): void {
        this.shacks = this.shacks.filter((candidate) => candidate !== shack);
        this.occupants.delete(shack.id);
    }

    private leaveAll(userId: number): void {
        for (const [shackId, occupant] of this.occupants) if (occupant === userId) this.occupants.delete(shackId);
    }

    private nearStool(shack: IceShack, player: IceShackPlayer): boolean {
        const seat = iceShackSeat(shack);
        return player.floorZ === 0 && Math.hypot(player.x - seat.x, player.y - seat.y) <= ICE_SHACK_REACH_PX;
    }

    private onStool(shack: IceShack, player: IceShackPlayer): boolean {
        const seat = iceShackSeat(shack);
        return Math.hypot(player.x - seat.x, player.y - seat.y) <= ICE_SHACK_SEAT_TOLERANCE_PX;
    }

    /** The user id of who put a shack up while they are in the room (`gone` just left it), else 0. */
    private ownerIdOf(shack: IceShack, gone?: number): number {
        for (const player of this.players().values()) {
            if (player.key === shack.ownerKey && player.id !== gone) return player.id;
        }
        return 0;
    }

    private signature(gone?: number): string {
        return this.shacks
            .map(
                (shack) =>
                    `${shack.id}:${this.ownerIdOf(shack, gone)}:${this.occupants.get(shack.id) ?? 0}:${
                        shack.crackingSince ?? ""
                    }`,
            )
            .join(";");
    }

    private message(
        events: readonly { userId: number; shackId: number; type: IceShackEvent }[],
        gone?: number,
    ): IceShacksMessage {
        const now = this.now();
        return {
            shacks: this.shacks.map((shack) => ({
                id: shack.id,
                x: Math.round(shack.x),
                y: Math.round(shack.y),
                ownerName: shack.ownerName,
                ownerUserId: this.ownerIdOf(shack, gone),
                occupantUserId: this.occupants.get(shack.id) ?? 0,
                ageMs: Math.max(0, Math.min(0xffffffff, Math.round(now - shack.builtAt))),
                crackingMs:
                    shack.crackingSince === undefined
                        ? 0
                        : Math.max(1, Math.round(ICE_SHACK_CRACK_MS - (now - shack.crackingSince))),
            })),
            events: events.map(
                (event): IceShackEventMessage => ({
                    userId: event.userId,
                    shackId: event.shackId,
                    type: iceShackEventOnWire(event.type),
                }),
            ),
        };
    }

    private tell(events: readonly { userId: number; shackId: number; type: IceShackEvent }[], gone?: number): void {
        this.sentSignature = this.signature(gone);
        this.room.sendSubMessageToRoom({
            message: { $case: "iceShacksMessage", iceShacksMessage: this.message(events, gone) },
        });
    }

    private save(): void {
        this.savedSeenAt = this.now();
        if (!this.store) return;
        const state = JSON.stringify({
            shacks: this.shacks.map(({ id, x, y, ownerKey, ownerName, builtAt, ownerSeenAt }) => ({
                id,
                x,
                y,
                ownerKey,
                ownerName,
                builtAt,
                ownerSeenAt,
            })),
            nextId: this.nextId,
        });
        this.store.repository
            .saveVariable(this.hashKey(), "state", state)
            .catch((error) => console.error("Could not save the ice fishing shacks of the map", error));
    }

    private hashKey(): string {
        return `ice-shacks:${this.store?.roomUrl ?? ""}`;
    }
}
