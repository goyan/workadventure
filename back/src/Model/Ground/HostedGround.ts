import { WaterSnapshot } from "@workadventure/map-editor";
import type { MapPlace, RealWeatherSlot, WaterGrid, WAMFileFormat } from "@workadventure/map-editor";
import type { SubToPusherRoomMessage } from "@workadventure/messages";
import type { GroundCommand, GroundRoomState, GroundTold, ToldFire } from "./GroundProtocol";
import { luckOf } from "./GroundProtocol";
import { InlineRoomGround } from "./InlineRoomGround";

/**
 * The ground of a room computed away from the thread of the rooms: the same water and the same meadow
 * (InlineRoomGround), fed by what the room sends (GroundCommand) instead of reading the room, and telling what the
 * room must know (GroundTold) instead of calling it: the states for its players, what to save, a copy of its water
 * for what lives in it, its meadow for who joins.
 */
export class HostedGround {
    private readonly ground: InlineRoomGround;
    private wam: WAMFileFormat | undefined;
    private state: GroundRoomState;
    /** What was saved before a restart, by key: given when the water, then the meadow, start. */
    private readonly stored: Record<string, Record<string, string>> = {};
    /** The grid the snapshot was made for: another grid (a map edited) takes another snapshot. */
    private grid: WaterGrid | undefined;
    private snapshot: WaterSnapshot | undefined;
    private readonly manual: boolean;
    private readonly histories = new Map<number, (slots: RealWeatherSlot[] | undefined) => void>();
    private asked = 0;
    private closed = false;
    private readonly roomUrl: string;

    constructor(
        private readonly room: number,
        open: Extract<GroundCommand, { kind: "open" }>,
        private readonly post: (told: GroundTold) => void,
    ) {
        this.roomUrl = open.roomUrl;
        this.wam = open.wam;
        this.state = open.state;
        this.manual = open.manual !== undefined;
        this.ground = new InlineRoomGround({
            room: {
                getWam: () => this.wam,
                sendSubMessageToRoom: (message) => this.tell(message),
            },
            rain: {
                slotsFor: () => this.state.slots,
                history: (place, since) => this.history(place, since),
            },
            store: {
                roomUrl: open.roomUrl,
                repository: {
                    loadVariables: (key) => Promise.resolve(key in this.stored ? this.stored[key] : {}),
                    saveVariable: (key, field, value) => {
                        this.post({ kind: "save", room: this.room, key, field, value });
                        return Promise.resolve(0);
                    },
                },
            },
            mapSize: () => this.state.mapSize,
            walkers: () => this.state.walkers,
            downpours: () => this.state.downpours,
            drains: () => this.state.drains,
            balls: () => this.state.balls,
            colds: () => this.state.colds ?? [],
            grazers: () => this.state.grazers,
            air: () => this.state.air,
            fire: () => this.state.fire,
            thresholds: () => this.state.thresholds,
            ...(open.manual
                ? { now: () => this.state.now ?? 0, clock: () => 0, random: luckOf(open.manual.seed) }
                : {}),
        });
        this.ground.water.stepped = () => this.publish();
        this.ground.meadow.stepped = () => {
            // The snow that melted on the meadow ran into the water: its copy follows at once.
            this.publish();
            this.tellMeadow();
        };
    }

    /** A command of the room. An error in it is told, and does not stop the ground. */
    public async handle(command: GroundCommand): Promise<void> {
        if (this.closed) return;
        try {
            await this.run(command);
        } catch (error) {
            this.post({
                kind: "error",
                room: this.room,
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }

    private async run(command: GroundCommand): Promise<void> {
        switch (command.kind) {
            case "open":
                return;
            case "startWater":
                this.stored[`terrain-water:${this.roomUrl}`] = command.stored;
                await this.ground.startWater();
                if (this.manual) this.ground.water.pause();
                this.publish();
                this.post({ kind: "started", room: this.room, part: "water" });
                return;
            case "startMeadow":
                this.stored[`meadow:${this.roomUrl}`] = command.stored;
                await this.ground.startMeadow();
                if (this.manual) this.ground.meadow.pause();
                this.tellMeadow();
                this.post({ kind: "started", room: this.room, part: "meadow" });
                return;
            case "state":
                this.state = command.state;
                return;
            case "wam":
                this.wam = this.adopt(command.wam, command.same);
                this.state = command.state;
                this.ground.mapChanged();
                if (this.manual) {
                    // A new grid starts its timer again: this ground is driven by hand.
                    this.ground.water.pause();
                    this.ground.meadow.pause();
                }
                break;
            case "strike":
                this.ground.strike(command.x, command.y, command.radiusTiles);
                break;
            case "shatter":
                this.ground.shatter(command.x, command.y, command.radiusTiles);
                break;
            case "ignite":
                this.ground.ignite(command.x, command.y, command.radiusTiles);
                break;
            case "burn":
                this.ground.burn(command.x, command.y, command.radiusTiles, command.id);
                break;
            case "soak":
                this.ground.soak(command.downpour);
                break;
            case "ballAt":
                // The level is decided here as the room decided it: the water holds its balls at the same levels.
                this.ground.ballLevelAt(command.id, command.x, command.y);
                return;
            case "history":
                this.histories.get(command.request)?.(command.slots);
                this.histories.delete(command.request);
                return;
            case "step":
                this.state = command.state;
                for (let step = 0; step < command.water; step++) this.ground.water.step();
                for (let step = 0; step < command.meadow; step++) this.ground.meadow.step();
                this.post({ kind: "stepped", room: this.room, reply: command.reply });
                return;
            case "close":
                this.closed = true;
                this.ground.stop();
                this.post({ kind: "closed", room: this.room });
                return;
        }
        // What a catastrophe or an edit of the map changed is seen at once, not at the next step.
        this.publish();
        this.tellMeadow();
    }

    /**
     * The map as it was sent, with the relief and the pools this ground already holds where the room says they are
     * the same: the water and the meadow know an edit of the relief by its object.
     */
    private adopt(
        wam: WAMFileFormat | undefined,
        same: { terrain: boolean; pools: boolean },
    ): WAMFileFormat | undefined {
        const before = this.wam;
        if (!wam || !before) return wam;
        return {
            ...wam,
            ...(same.terrain ? { terrain: before.terrain } : {}),
            ...(same.pools && wam.settings ? { settings: { ...wam.settings, pools: before.settings?.pools } } : {}),
        };
    }

    /** A state for the players of the room; with it, for the water, the whole state they now know, for who joins. */
    private tell(message: SubToPusherRoomMessage): void {
        if (message.message?.$case !== "terrainWaterMessage") {
            this.post({ kind: "told", room: this.room, message });
            return;
        }
        const told = this.ground.water.lastTold();
        this.post({
            kind: "told",
            room: this.room,
            message,
            ...(told ? { water: { ...told, bytes: Uint8Array.from(told.bytes) } } : {}),
        });
    }

    /** Copies the water where the thread of the rooms reads it; a grid that is another one takes another copy. */
    private publish(): void {
        const grid = this.ground.water.getGrid();
        if (grid !== this.grid) {
            this.grid = grid;
            this.snapshot = grid ? WaterSnapshot.allocate(grid.bounds, true) : undefined;
            // Written before it is told: the room never reads a copy never written.
            if (grid && this.snapshot) grid.publish(this.snapshot, this.ground.waterVersion());
            this.post({
                kind: "grid",
                room: this.room,
                grid: this.snapshot ? { bounds: this.snapshot.bounds, buffers: this.snapshot.buffers } : undefined,
            });
            return;
        }
        if (grid && this.snapshot) grid.publish(this.snapshot, this.ground.waterVersion());
    }

    /** The meadow as who joins is sent it, its trees, and its fire for the animals. */
    private tellMeadow(): void {
        const meadow = this.ground.meadow;
        const burning = meadow.burningTiles();
        const trees = meadow.treeFires().map(({ x, y }) => ({ x, y }));
        const fire: ToldFire | undefined =
            burning || trees.length > 0
                ? {
                      width: burning?.width ?? 0,
                      height: burning?.height ?? 0,
                      burning: burning?.burning ?? new Uint8Array(0),
                      trees,
                  }
                : undefined;
        this.post({
            kind: "meadow",
            room: this.room,
            snapshot: meadow.snapshot(),
            trees: meadow.treeSnapshot(),
            fire,
            ice: meadow.iceTiles(),
            catchingUp: meadow.catchingUp(),
        });
    }

    /** The weather of the past is asked of the thread of the rooms, which alone talks to the outside. */
    private history(place: MapPlace | undefined, since: number): Promise<RealWeatherSlot[] | undefined> {
        const request = ++this.asked;
        return new Promise((resolve) => {
            this.histories.set(request, resolve);
            this.post({ kind: "history", room: this.room, request, place, since });
        });
    }
}
