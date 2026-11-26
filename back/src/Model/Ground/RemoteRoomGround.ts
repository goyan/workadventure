import { gzipSync } from "node:zlib";
import { BallLevels, lifeFireOf, WaterSnapshot, WaterSnapshotView, WeatherType } from "@workadventure/map-editor";
import type { Downpour, LifeFire, RealWeatherSlot, WAMFileFormat, WaterView } from "@workadventure/map-editor";
import type { HurricaneAirMessage, MeadowMessage, TerrainWaterMessage, TreeFireMessage } from "@workadventure/messages";
import { TerrainWaterManager } from "../TerrainWaterManager";
import type { GroundCommand, GroundPort, GroundRoomState, GroundTold, ToldFire, ToldWater } from "./GroundProtocol";
import type { GroundThreads } from "./GroundThreads";
import { InlineRoomGround } from "./InlineRoomGround";
import type { RoomGround, RoomGroundInputs } from "./RoomGround";

/** What the ground reads of the room is sent to its thread this often (ms), when it changed: once a step of the water. */
const STATE_EVERY_MS = 100;
/** The real weather of the map is read again this often (ms). */
const SLOTS_EVERY_MS = 1000;
/** A thread lost this many times within LOST_WINDOW_MS: the ground goes back to the thread of the rooms. */
const MOST_LOSSES = 3;
const LOST_WINDOW_MS = 5 * 60_000;

/** A ground driven by hand, for the tests that compare it step by step with one computed on the thread of the rooms. */
export interface ManualGround {
    seed: number;
}

/**
 * The ground of a room computed on another thread (HostedGround, in a GroundWorker): the thread of the rooms only
 * sends what the ground reads of the room when it changed, relays what the ground tells its players, writes what it
 * saves, and reads a copy of its water (WaterSnapshotView) for what lives in it. A step of the water no longer holds
 * the rooms back.
 *
 * What the room reads here is at most one step of the water old (a tenth of a second): the water of the snapshot, the
 * meadow sent to who joins, the fire the animals flee.
 */
export class RemoteRoomGround implements RoomGround {
    private room: number;
    private port: GroundPort;
    private readonly roomUrl: string;
    private opened = false;
    private stopped = false;
    private timer: ReturnType<typeof setInterval> | undefined;
    /** The state last sent, as text: sent again only when it changed. */
    private sentState: string | undefined;
    private sentWam: unknown;
    private sentTerrain: unknown;
    private sentPools: unknown;
    /** What was saved, by key and field: what a ground started again starts from. */
    private readonly saved: Record<string, Record<string, string>> = {};
    private waterStarted = false;
    private meadowStarted = false;
    private readonly waiting = new Map<string, () => void>();
    private replies = 0;
    private view: WaterSnapshotView | undefined;
    private version = 0;
    private toldWater: ToldWater | undefined;
    private meadow: MeadowMessage | undefined;
    private trees: TreeFireMessage | undefined;
    /** The wind of the air of the hurricane the thread last told. */
    private air: HurricaneAirMessage | undefined;
    private fire: ToldFire | undefined;
    private ice: { width: number; height: number; mm?: Float32Array } | undefined;
    /** Whether the meadow still lives the time the room missed, as it last said. */
    private missed = false;
    private readonly ballLevels = new BallLevels();
    private readSlots: RealWeatherSlot[] | undefined;
    private slotsAt = -Infinity;
    private readonly losses: number[] = [];
    /** After too many threads lost: the ground computed on the thread of the rooms, which takes every call. */
    private fallback: InlineRoomGround | undefined;

    constructor(
        private readonly inputs: RoomGroundInputs,
        private readonly threads: Pick<GroundThreads, "assign">,
        private readonly manual?: ManualGround,
    ) {
        this.roomUrl = inputs.store?.roomUrl ?? "";
        const { room, port } = threads.assign();
        this.room = room;
        this.port = port;
        this.listen();
    }

    public async startWater(): Promise<void> {
        const key = `terrain-water:${this.roomUrl}`;
        this.saved[key] = await this.load(key);
        this.waterStarted = true;
        this.open();
        const started = this.wait("started:water");
        this.post({ kind: "startWater", room: this.room, stored: this.saved[key] });
        await started;
    }

    public async startMeadow(): Promise<void> {
        if (this.fallback) return this.fallback.startMeadow();
        const key = `meadow:${this.roomUrl}`;
        this.saved[key] = await this.load(key);
        this.meadowStarted = true;
        this.open();
        this.sendState();
        const started = this.wait("started:meadow");
        this.post({ kind: "startMeadow", room: this.room, stored: this.saved[key] });
        await started;
    }

    public stop(): void {
        if (this.fallback) return this.fallback.stop();
        if (this.stopped) return;
        this.stopped = true;
        if (this.timer) clearInterval(this.timer);
        this.timer = undefined;
        // What it saves as it stops still comes: the room is forgotten once the thread says it is closed.
        if (this.opened) this.post({ kind: "close", room: this.room });
        else this.port.forget(this.room);
    }

    public mapChanged(): void {
        if (this.fallback) return this.fallback.mapChanged();
        if (!this.opened) return;
        const wam = this.inputs.room.getWam();
        // The relief is the heaviest part of a map: left out while it is the same object as when it was last sent.
        const same = {
            terrain: wam !== undefined && wam.terrain === this.sentTerrain,
            pools: wam !== undefined && wam.settings?.pools === this.sentPools,
        };
        this.keepSent(wam);
        const state = this.state();
        this.sentState = JSON.stringify(state);
        this.post({
            kind: "wam",
            room: this.room,
            wam: wam && same.terrain ? { ...wam, terrain: undefined } : wam,
            same,
            state,
        });
    }

    public strike(x: number, y: number, radiusTiles: number): void {
        if (this.fallback) return this.fallback.strike(x, y, radiusTiles);
        this.act({ kind: "strike", room: this.room, x, y, radiusTiles });
    }

    public burn(x: number, y: number, radiusTiles: number, id: number): void {
        if (this.fallback) return this.fallback.burn(x, y, radiusTiles, id);
        this.act({ kind: "burn", room: this.room, x, y, radiusTiles, id });
    }

    public shatter(x: number, y: number, radiusTiles: number): void {
        if (this.fallback) return this.fallback.shatter(x, y, radiusTiles);
        this.act({ kind: "shatter", room: this.room, x, y, radiusTiles });
    }

    public calm(): void {
        if (this.fallback) return this.fallback.calm();
        this.act({ kind: "calm", room: this.room });
    }

    public soak(downpour: Pick<Downpour, "x" | "y" | "radiusTiles" | "wholeMap">): void {
        if (this.fallback) return this.fallback.soak(downpour);
        const { x, y, radiusTiles, wholeMap } = downpour;
        this.act({ kind: "soak", room: this.room, downpour: { x, y, radiusTiles, wholeMap } });
    }

    public ignite(x: number, y: number, radiusTiles: number): void {
        if (this.fallback) return this.fallback.ignite(x, y, radiusTiles);
        this.act({ kind: "ignite", room: this.room, x, y, radiusTiles });
    }

    public ballLevelAt(id: number, x: number, y: number): number {
        if (this.fallback) return this.fallback.ballLevelAt(id, x, y);
        // Decided here on the copy of the water, for the room that asks at once; and there on the water itself, so
        // that it holds its balls at the levels it would have decided alone.
        const level = this.ballLevels.levelAt(id, x, y, this.getGrid(), () => this.inputs.room.getWam()?.terrain);
        if (this.opened) this.post({ kind: "ballAt", room: this.room, id, x, y });
        return level;
    }

    public getGrid(): WaterView | undefined {
        if (this.fallback) return this.fallback.getGrid();
        const view = this.view;
        if (view?.refresh()) this.version = view.version();
        return view;
    }

    public waterVersion(): number {
        if (this.fallback) return this.fallback.waterVersion();
        this.getGrid();
        return this.version;
    }

    public lifeFire(): LifeFire | undefined {
        if (this.fallback) return this.fallback.lifeFire();
        const fire = this.fire;
        if (!fire) return undefined;
        return lifeFireOf(
            {
                fireAt: (tileX, tileY) =>
                    tileX >= 0 && tileY >= 0 && tileX < fire.width && tileY < fire.height
                        ? fire.burning[tileY * fire.width + tileX]
                        : 0,
            },
            () => fire.trees,
        );
    }

    public fireTiles(): ToldFire | undefined {
        if (this.fallback) return this.fallback.fireTiles();
        return this.fire;
    }

    public iceAt(tileX: number, tileY: number): number {
        if (this.fallback) return this.fallback.iceAt(tileX, tileY);
        const ice = this.ice;
        if (!ice?.mm || tileX < 0 || tileY < 0 || tileX >= ice.width || tileY >= ice.height) return 0;
        return ice.mm[tileY * ice.width + tileX];
    }

    public hasMeadow(): boolean {
        if (this.fallback) return this.fallback.hasMeadow();
        return this.ice !== undefined;
    }

    public catchingUp(): boolean {
        if (this.fallback) return this.fallback.catchingUp();
        return this.missed;
    }

    public waterSnapshot(): TerrainWaterMessage | undefined {
        if (this.fallback) return this.fallback.waterSnapshot();
        return this.toldWater && TerrainWaterManager.snapshotOf(this.toldWater);
    }

    public meadowSnapshot(): MeadowMessage | undefined {
        if (this.fallback) return this.fallback.meadowSnapshot();
        return this.meadow;
    }

    public treeSnapshot(): TreeFireMessage | undefined {
        if (this.fallback) return this.fallback.treeSnapshot();
        return this.trees;
    }

    public airSnapshot(): HurricaneAirMessage | undefined {
        if (this.fallback) return this.fallback.airSnapshot();
        // The thread says nothing when a hurricane ends: the wind it told is that of the hurricane still crossing.
        const air = this.air;
        return air && this.inputs.hurricane?.()?.id === air.hurricaneId ? air : undefined;
    }

    /**
     * Driven by hand: the state of the room is sent, then the ground makes these many steps of its water and of its
     * meadow; resolved once all they told and saved has come.
     */
    public async stepByHand(water: number, meadow: number): Promise<void> {
        const reply = ++this.replies;
        const stepped = this.wait(`stepped:${reply}`);
        this.post({ kind: "step", room: this.room, reply, water, meadow, state: this.state() });
        await stepped;
    }

    /** Resolved once the thread said the ground is closed: all it saved as it stopped has come. */
    public closed(): Promise<void> {
        return this.fallback || !this.opened ? Promise.resolve() : this.wait("closed");
    }

    private listen(): void {
        this.port.listen(
            this.room,
            (told) => this.told(told),
            () => this.lost(),
        );
    }

    private post(command: GroundCommand): void {
        this.port.post(command);
    }

    /** A catastrophe: the ground first knows the room as it is now, then what happens to it. */
    private act(command: GroundCommand): void {
        if (!this.opened) return;
        this.sendState();
        this.post(command);
    }

    /** The ground is made on its thread, once: with the map and the room as they are. */
    private open(): void {
        if (this.opened) return;
        this.opened = true;
        const wam = this.inputs.room.getWam();
        const state = this.state();
        this.keepSent(wam);
        this.sentState = JSON.stringify(state);
        this.post({
            kind: "open",
            room: this.room,
            roomUrl: this.roomUrl,
            wam,
            state,
            ...(this.manual ? { manual: { seed: this.manual.seed } } : {}),
        });
        if (!this.manual) {
            this.timer = setInterval(() => this.sendState(), STATE_EVERY_MS);
            // The ground of a room must never keep the process alive.
            this.timer.unref?.();
        }
    }

    /** The map as it was last sent, and its relief and its pools: what tells an edit from a map that is the same. */
    private keepSent(wam: WAMFileFormat | undefined): void {
        this.sentWam = wam;
        this.sentTerrain = wam?.terrain;
        this.sentPools = wam?.settings?.pools;
    }

    /** What the ground reads of the room, by value. */
    private state(): GroundRoomState {
        const { inputs } = this;
        const balls = inputs.balls();
        // The water decides the level of each ball it holds at each of its steps, and forgets the balls that are
        // gone: the same is done here on its copy, so that the room is answered the levels the water holds them at.
        if (balls.length === 0) this.ballLevels.clear();
        else {
            const water = this.getGrid();
            const terrain = () => inputs.room.getWam()?.terrain;
            for (const ball of balls) this.ballLevels.levelAt(ball.id, ball.x, ball.y, water, terrain);
            this.ballLevels.keep(balls.map((ball) => ball.id));
        }
        return {
            mapSize: inputs.mapSize(),
            walkers: inputs.walkers(),
            downpours: inputs.downpours(),
            drains: inputs.drains(),
            balls,
            ...(inputs.colds && inputs.colds().length > 0 ? { colds: inputs.colds() } : {}),
            ...(inputs.hurricane?.() ? { hurricane: inputs.hurricane() } : {}),
            ...(inputs.tsunami?.() ? { tsunami: inputs.tsunami() } : {}),
            ...(inputs.zombies?.() ? { zombies: inputs.zombies() } : {}),
            grazers: inputs.grazers(),
            air: inputs.air(),
            fire: inputs.fire(),
            thresholds: inputs.thresholds(),
            slots: this.slots(),
            ...(this.manual && inputs.now ? { now: inputs.now() } : {}),
        };
    }

    /**
     * The real weather at the place of the map, for a map in real weather only (asking for it fetches it), and read
     * again once a second at most, as the water and the meadow read it.
     */
    private slots(): RealWeatherSlot[] | undefined {
        const settings = this.inputs.room.getWam()?.settings;
        if (settings?.weather !== WeatherType.Real) return undefined;
        const now = Date.now();
        if (this.manual || now - this.slotsAt >= SLOTS_EVERY_MS) {
            this.slotsAt = now;
            this.readSlots = this.inputs.rain.slotsFor(settings.weatherLocation);
        }
        return this.readSlots;
    }

    /** Sends the room as it is to the ground when it changed since it was last sent; a map that is another one too. */
    private sendState(): void {
        if (!this.opened || this.stopped) return;
        if (this.inputs.room.getWam() !== this.sentWam) {
            this.mapChanged();
            return;
        }
        const state = this.state();
        const text = JSON.stringify(state);
        if (text === this.sentState) return;
        this.sentState = text;
        this.post({ kind: "state", room: this.room, state });
    }

    private told(told: GroundTold): void {
        switch (told.kind) {
            case "told":
                if (told.water) this.toldWater = told.water;
                if (told.message.message?.$case === "hurricaneAirMessage")
                    this.air = told.message.message.hurricaneAirMessage;
                this.inputs.room.sendSubMessageToRoom(told.message);
                return;
            case "grid":
                // Another grid: another view, so that what lives in the water reads it all again; and the room knows
                // no state of it yet.
                this.view = told.grid
                    ? new WaterSnapshotView(WaterSnapshot.over(told.grid.bounds, told.grid.buffers))
                    : undefined;
                this.toldWater = undefined;
                if (this.view?.refresh()) this.version = this.view.version();
                return;
            case "meadow":
                this.meadow = told.snapshot;
                this.trees = told.trees;
                this.fire = told.fire;
                this.ice = told.ice;
                this.missed = told.catchingUp;
                return;
            case "save":
                (this.saved[told.key] ??= {})[told.field] = told.value;
                this.inputs.store?.repository
                    .saveVariable(told.key, told.field, told.value)
                    .catch((error: unknown) => console.error("Could not save the ground of the map", error));
                return;
            case "history":
                this.inputs.rain
                    .history(told.place, told.since)
                    .catch(() => undefined)
                    .then((slots) => this.post({ kind: "history", room: this.room, request: told.request, slots }))
                    .catch((error: unknown) => console.error("Could not answer the ground of the map", error));
                return;
            case "started":
                this.resolve(`started:${told.part}`);
                return;
            case "stepped":
                this.resolve(`stepped:${told.reply}`);
                return;
            case "closed":
                this.port.forget(this.room);
                this.resolve("closed");
                return;
            case "error":
                console.error("The ground of the map failed on its thread", told.message);
                return;
            case "band":
            case "slices":
                return;
        }
    }

    private async load(key: string): Promise<Record<string, string>> {
        if (!this.inputs.store) return {};
        try {
            return await this.inputs.store.repository.loadVariables(key);
        } catch (error) {
            console.error("Could not restore the ground of the map", error);
            return {};
        }
    }

    private wait(what: string): Promise<void> {
        return new Promise((resolve) => {
            this.waiting.set(what, resolve);
        });
    }

    private resolve(what: string): void {
        this.waiting.get(what)?.();
        this.waiting.delete(what);
    }

    /**
     * The thread that computed this ground was lost. The ground starts again on another: its water from the copy the
     * room holds (what stood under a ball apart), its meadow from what was last saved. After too many losses it is
     * computed on the thread of the rooms, as without threads.
     */
    private lost(): void {
        if (this.stopped || this.fallback) return;
        const now = Date.now();
        this.losses.push(now);
        while (this.losses.length > 0 && now - this.losses[0] > LOST_WINDOW_MS) this.losses.shift();
        this.port.forget(this.room);
        // Who waited for it waits no longer: the ground that starts again answers nothing of before.
        for (const what of [...this.waiting.keys()]) this.resolve(what);
        this.keepWater();
        this.opened = false;
        if (this.timer) clearInterval(this.timer);
        this.timer = undefined;
        const again = async (ground: Pick<RoomGround, "startWater" | "startMeadow">): Promise<void> => {
            if (this.waterStarted) await ground.startWater();
            if (this.meadowStarted) await ground.startMeadow();
        };
        if (this.losses.length >= MOST_LOSSES) {
            console.error("The ground of the map lost its thread too often: computed on the thread of the rooms");
            // The ground of the thread of the rooms reads what was saved in the store: the water the room holds a
            // copy of is written there first.
            const fallback = new InlineRoomGround(this.inputs);
            this.view = undefined;
            const key = `terrain-water:${this.roomUrl}`;
            const store = this.inputs.store;
            const kept = this.waterStarted && store ? Object.entries(this.saved[key] ?? {}) : [];
            Promise.all(
                kept.map(([field, value]) => Promise.resolve(store?.repository.saveVariable(key, field, value))),
            )
                .catch((error: unknown) => console.error("Could not save the ground of the map", error))
                .then(() => again(fallback))
                .then(() => {
                    this.fallback = fallback;
                })
                .catch((error: unknown) => console.error("The ground of the map could not start again", error));
            return;
        }
        const { room, port } = this.threads.assign();
        this.room = room;
        this.port = port;
        this.listen();
        again({
            startWater: () => this.restart("water"),
            startMeadow: () => this.restart("meadow"),
        }).catch((error: unknown) => console.error("The ground of the map could not start again", error));
    }

    /** Starts a part of the ground again from what the room holds of it, without reading the store again. */
    private async restart(part: "water" | "meadow"): Promise<void> {
        this.open();
        const key = `${part === "water" ? "terrain-water" : "meadow"}:${this.roomUrl}`;
        const started = this.wait(`started:${part}`);
        this.post({
            kind: part === "water" ? "startWater" : "startMeadow",
            room: this.room,
            stored: this.saved[key] ?? {},
        });
        await started;
    }

    /** The water of the copy the room holds becomes what the water starts again from, written as a save writes it. */
    private keepWater(): void {
        const view = this.view;
        if (!view) return;
        view.refresh();
        const { x, y, width, height } = view.bounds;
        const bytes = new Uint8Array(width * height * 2);
        for (let row = 0; row < height; row++) {
            for (let column = 0; column < width; column++) {
                const eighths = Math.min(65535, Math.round(view.depthAt(x + column, y + row) * 8));
                const at = (row * width + column) * 2;
                bytes[at] = eighths & 255;
                bytes[at + 1] = eighths >> 8;
            }
        }
        this.saved[`terrain-water:${this.roomUrl}`] = {
            grid: Buffer.from(gzipSync(bytes)).toString("base64"),
            bounds: JSON.stringify(view.bounds),
        };
    }
}
