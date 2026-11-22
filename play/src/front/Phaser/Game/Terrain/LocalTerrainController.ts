import type { RealWeatherSlot, SeededMeadow, WAMFileFormat, WeatherLocation } from "@workadventure/map-editor";
import type { TerrainWaterStatsMessage } from "@workadventure/messages";
import type { LocalTerrainCommand, LocalTerrainTold } from "./LocalTerrainSimulation";
import { TerrainWater } from "./TerrainWater";
import type { WaterState } from "./TerrainWater";

/** The worker that runs the local ground, as the controller drives it (a Worker; a fake one in the tests). */
export interface LocalTerrainPort {
    postMessage(command: LocalTerrainCommand): void;
    terminate(): void;
    onmessage: ((event: MessageEvent<LocalTerrainTold>) => void) | null;
}

/** What the controller reads of the game, and where it shows the ground. */
export interface LocalTerrainScene {
    /**
     * The place this player follows when their own ground should live (Jour dans le monde, a point chosen, not in
     * Basique nor while the map is edited), with its weather once known; undefined: the ground of the server.
     */
    chosenPlace(): { place: WeatherLocation; slots: readonly RealWeatherSlot[] | undefined } | undefined;
    /** The map and a key that changes with each of its edits; undefined until it is read. */
    map(): { wam: WAMFileFormat; key: string; mapCells: { width: number; height: number } } | undefined;
    /** Where the avatar of this player stands on the ground (map pixels): none while on a raised floor. */
    walkers(): readonly { x: number; y: number }[];
    /** The water the game shows, and what it tells of the water (the dashboard of the relief tool). */
    water: TerrainWater;
    showWaterStats(stats: TerrainWaterStatsMessage | undefined): void;
    /** The meadow the game shows. */
    showMeadow(state: SeededMeadow & { fire?: Uint8Array }): void;
}

/** The avatar is told to the local ground this often (ms): the doors it holds open. */
const WALKERS_EVERY_MS = 1000;

type MeadowState = SeededMeadow & { fire?: Uint8Array };

/**
 * Runs the ground of this player while they follow the weather of a place they chose (LocalTerrainSimulation, in a
 * worker): their own lakes, rivers, meadow and snow, started from the ground of the server at that moment. Meanwhile
 * the states the server tells are kept aside, not shown; back to the ground of the server (another day and night
 * mode, Basique, the map editor), the local ground is let go and the game shows the last state of the server at once.
 */
export class LocalTerrainController {
    private port: LocalTerrainPort | undefined;
    /** Counts the starts: a worker that opens after its ground was let go is closed at once. */
    private generation = 0;
    private running = false;
    /** The water of the server while the local ground runs: what the game goes back to. */
    private serverWater: TerrainWater | undefined;
    /** The last meadow of the server, always: where a local ground starts, and what the game goes back to. */
    private serverMeadow: MeadowState | undefined;
    private sentPlace: { place: WeatherLocation; slots: readonly RealWeatherSlot[] } | undefined;
    private sentMap: { key: string; wam: WAMFileFormat } | undefined;
    private walkersAt = -Infinity;
    /** The place whose local ground could not start: not tried again until another place is chosen. */
    private failedPlace: WeatherLocation | undefined;

    constructor(
        private readonly scene: LocalTerrainScene,
        private readonly open: () => Promise<LocalTerrainPort>,
        private readonly now: () => number,
    ) {}

    /** Whether the game shows the ground of this player rather than the ground of the server. */
    public isLocal(): boolean {
        return this.running;
    }

    /** A state of the water from the server: true when it is kept aside (the local ground is shown). */
    public fromServerWater(state: WaterState): boolean {
        if (!this.serverWater) return false;
        this.serverWater.receive(state, this.now());
        return true;
    }

    /** A state of the meadow from the server: true when it is kept aside (the local ground is shown). */
    public fromServerMeadow(state: MeadowState): boolean {
        this.serverMeadow = state;
        return this.running;
    }

    /** At each image: starts or lets go the local ground, and tells it what changed around it. */
    public update(): void {
        const chosen = this.scene.chosenPlace();
        if (!chosen) {
            this.failedPlace = undefined;
            if (this.running) this.letGo();
            return;
        }
        // A start that failed is not tried again at each image: the whole ground would be drawn again each time.
        if (!this.running && samePlace(chosen.place, this.failedPlace)) return;
        // The weather of the place may be fetched again: the last one known goes on meanwhile.
        const slots = chosen.slots ?? this.sentPlace?.slots;
        if (!this.running) {
            if (slots) this.start(chosen.place, slots);
            return;
        }
        const port = this.port;
        if (!port) return;
        if (!samePlace(this.sentPlace?.place, chosen.place) || this.sentPlace?.slots !== slots) {
            if (slots) {
                this.sentPlace = { place: chosen.place, slots };
                port.postMessage({ kind: "place", place: chosen.place, slots });
            }
        }
        const map = this.scene.map();
        if (map && (map.key !== this.sentMap?.key || map.wam.terrain !== this.sentMap.wam.terrain)) {
            this.sentMap = { key: map.key, wam: map.wam };
            port.postMessage({ kind: "wam", wam: map.wam });
        }
        const now = this.now();
        if (now - this.walkersAt >= WALKERS_EVERY_MS) {
            this.walkersAt = now;
            port.postMessage({ kind: "walkers", walkers: this.scene.walkers() });
        }
    }

    /** The scene is closed: the local ground goes with it, and nothing is shown again. */
    public destroy(): void {
        this.generation++;
        this.port?.terminate();
        this.port = undefined;
        this.running = false;
        this.serverWater = undefined;
    }

    private start(place: WeatherLocation, slots: readonly RealWeatherSlot[]): void {
        const map = this.scene.map();
        if (!map) return;
        this.running = true;
        const generation = ++this.generation;
        // From now on the server is heard aside, from the water shown now: its own.
        const shown = this.scene.water.wholeState();
        this.serverWater = new TerrainWater();
        if (shown) this.serverWater.receive(shown, this.now());
        this.sentPlace = { place, slots };
        this.sentMap = { key: map.key, wam: map.wam };
        this.walkersAt = this.now();
        const meadow = this.serverMeadow;
        this.open()
            .then((port) => {
                if (generation !== this.generation) {
                    port.terminate();
                    return;
                }
                this.port = port;
                port.onmessage = (event): void => this.show(event.data);
                port.postMessage({
                    kind: "start",
                    start: {
                        wam: map.wam,
                        mapCells: map.mapCells,
                        place,
                        slots,
                        ...(shown
                            ? {
                                  water: {
                                      depths: shown.depths,
                                      bounds: { x: shown.x, y: shown.y, width: shown.width, height: shown.height },
                                  },
                              }
                            : {}),
                        ...(meadow ? { meadow: withoutServerCold(meadow) } : {}),
                    },
                });
                port.postMessage({ kind: "walkers", walkers: this.scene.walkers() });
            })
            .catch((error: unknown) => {
                // Without its worker the player keeps the ground of the server: the weather of their place still
                // shows, only their lakes do not follow it.
                console.warn("The local ground could not start: the ground of the server is shown", error);
                if (generation !== this.generation) return;
                this.failedPlace = place;
                this.letGo();
            });
    }

    private show(told: LocalTerrainTold): void {
        if (!this.running) return;
        if (told.kind === "water") {
            this.scene.water.receive(told.message, this.now());
            this.scene.showWaterStats(told.message.stats);
            return;
        }
        this.scene.showMeadow(told.message);
    }

    /** Back to the ground of the server: the local one is let go, and the last state of the server is shown at once. */
    private letGo(): void {
        const server = this.serverWater?.wholeState();
        this.destroy();
        this.sentPlace = undefined;
        this.sentMap = undefined;
        if (server) this.scene.water.receive(server, this.now());
        if (this.serverMeadow) this.scene.showMeadow(this.serverMeadow);
    }
}

/**
 * Opens a module worker from its script `url`, through a script of this page's own origin that imports it: the game
 * may be served from another origin than its scripts (the Vite server in dev, a CDN), and a worker cannot be built
 * straight from a script of another origin. The script must answer that origin with CORS, as its server does.
 */
export function openModuleWorker(url: string): Worker {
    const absolute = new URL(url, import.meta.url).href;
    const source = URL.createObjectURL(new Blob([`import ${JSON.stringify(absolute)};`], { type: "text/javascript" }));
    const worker = new Worker(source, { type: "module" });
    // The worker has its script once it runs: its first message says so.
    worker.addEventListener("message", () => URL.revokeObjectURL(source), { once: true });
    return worker;
}

/** Whether two places are the same point of the world, whichever objects hold them. */
function samePlace(a: WeatherLocation | undefined, b: WeatherLocation | undefined): boolean {
    return a !== undefined && b !== undefined && a.latitude === b.latitude && a.longitude === b.longitude;
}

/**
 * The meadow of the server without its snow and its ice: they come of the weather of the server, and would stay for
 * hours under the sun of the place chosen. The local ground lays its own, from the weather of that place.
 */
function withoutServerCold(meadow: MeadowState): SeededMeadow {
    const { width, height, grass, moisture, dryness, ash } = meadow;
    return { width, height, grass, moisture, ...(dryness && { dryness }), ...(ash && { ash }) };
}
