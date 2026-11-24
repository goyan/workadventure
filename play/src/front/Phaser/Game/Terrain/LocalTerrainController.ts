import { waterKernelNamed } from "@workadventure/map-editor";
import type {
    RealWeatherSlot,
    SeededMeadow,
    WAMFileFormat,
    WaterKernelKind,
    WeatherLocation,
} from "@workadventure/map-editor";
import type { CatastropheMessage, TerrainWaterStatsMessage } from "@workadventure/messages";
import { LocalCatastropheRelay } from "./LocalCatastropheRelay";
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
    /**
     * Fast water (FastWaterStore), when it applies (neither Basique nor the map editor), with the weather timeline of
     * the place of the map once known: the air of the map, for the ground of this player when no place is chosen.
     */
    fastWater(): { slots: readonly RealWeatherSlot[] | undefined } | undefined;
    /** The local water has gone back to the water of the server (« retour à l'eau partagée »). */
    backToSharedWater(): void;
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
/** Back to the ground of the server, its water glides from the local one this long (ms). */
const BACK_TO_SERVER_GLIDE_MS = 1000;

type MeadowState = SeededMeadow & { fire?: Uint8Array };

/**
 * What computes the water this browser simulates for its player (the water of a local weather, the fast water): the
 * TypeScript kernel, or the compiled one for who typed `localStorage.setItem("waterKernel", "wasm")` in the console
 * (a setting of the developers, without any interface; the same water, to the bit). Read when the local water starts.
 */
export function localWaterKernel(): WaterKernelKind {
    try {
        return waterKernelNamed(localStorage.getItem("waterKernel"));
    } catch {
        return "typescript";
    }
}

/**
 * Runs the ground of this player while they follow the weather of a place they chose, or while their water is fast
 * (LocalTerrainSimulation, in a worker): their own lakes, rivers, meadow and snow, started from the ground of the
 * server at that moment. Meanwhile the states the server tells are kept aside, not shown; back to the ground of the
 * server (another day and night mode, fast water off, Basique, the map editor), the local ground is let go and the
 * water of the server shown again, gliding to it in a second. Nothing is saved: the local ground starts again from
 * the ground of the server each time, when the tab comes back too (its worker stops while it is hidden).
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
    private sentPlace: { place: WeatherLocation | undefined; slots: readonly RealWeatherSlot[] } | undefined;
    private sentFast = false;
    /** The tab is hidden: no local ground until it comes back. */
    private tabHidden = false;
    private sentMap: { key: string; wam: WAMFileFormat } | undefined;
    private walkersAt = -Infinity;
    /** The catastrophes of the room, as the server tells them: the local ground lives them too. */
    private readonly catastrophes = new LocalCatastropheRelay();
    /** The ground that could not start (a place, or the map's): not tried again until another is asked. */
    private failedKey: string | undefined;

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

    /** A catastrophe the server tells the room: the local ground, if any, takes it too (now, or when it lands). */
    public fromCatastrophe(message: CatastropheMessage): void {
        const commands = this.catastrophes.receive(message, this.now());
        if (this.port) for (const command of commands) this.port.postMessage(command);
    }

    /** At each image: starts or lets go the local ground, and tells it what changed around it. */
    public update(): void {
        // What lands or ends is followed whether a local ground runs or not: one that starts later is told the rest.
        const landed = this.catastrophes.due(this.now());
        if (this.port) for (const command of landed) this.port.postMessage(command);
        const asked = this.tabHidden ? undefined : this.asked();
        if (!asked) {
            this.failedKey = undefined;
            if (this.running) this.letGo(true);
            return;
        }
        // A start that failed is not tried again at each image: the whole ground would be drawn again each time.
        if (!this.running && asked.key === this.failedKey) return;
        // The weather of the place may be fetched again: the last one known goes on meanwhile.
        const slots =
            asked.slots ?? (samePlaceOrMap(this.sentPlace?.place, asked.place) ? this.sentPlace?.slots : undefined);
        if (!this.running) {
            if (slots) this.start(asked.place, slots, asked.fast, asked.key);
            return;
        }
        const port = this.port;
        if (!port) return;
        if (!samePlaceOrMap(this.sentPlace?.place, asked.place) || this.sentPlace?.slots !== slots) {
            if (slots) {
                this.sentPlace = { place: asked.place, slots };
                port.postMessage({ kind: "place", place: asked.place, slots });
            }
        }
        if (asked.fast !== this.sentFast) {
            this.sentFast = asked.fast;
            port.postMessage({ kind: "fast", fast: asked.fast });
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

    /**
     * The tab is hidden, or back: hidden, the worker stops (nothing would be seen of it) and the water of the server
     * is shown; back, the next image starts the local ground again from the water of the server.
     */
    public hidden(hidden: boolean): void {
        this.tabHidden = hidden;
        if (hidden && this.running) this.letGo(false);
    }

    /** « Resynchroniser »: the local ground starts again from the ground of the server, at the next image. */
    public resynchronize(): void {
        if (this.running) this.letGo(false);
    }

    /** The ground this player asks for now: a place followed, or fast water alone under the weather of the map. */
    private asked():
        | {
              place: WeatherLocation | undefined;
              slots: readonly RealWeatherSlot[] | undefined;
              fast: boolean;
              key: string;
          }
        | undefined {
        const fast = this.scene.fastWater();
        const chosen = this.scene.chosenPlace();
        if (chosen) {
            return {
                place: chosen.place,
                slots: chosen.slots,
                fast: fast !== undefined,
                key: `${chosen.place.latitude},${chosen.place.longitude}`,
            };
        }
        return fast && { place: undefined, slots: fast.slots, fast: true, key: "map" };
    }

    /** The scene is closed: the local ground goes with it, and nothing is shown again. */
    public destroy(): void {
        this.generation++;
        this.port?.terminate();
        this.port = undefined;
        this.running = false;
        this.serverWater = undefined;
    }

    private start(
        place: WeatherLocation | undefined,
        slots: readonly RealWeatherSlot[],
        fast: boolean,
        key: string,
    ): void {
        const map = this.scene.map();
        if (!map) return;
        this.running = true;
        const generation = ++this.generation;
        // From now on the server is heard aside, from the water shown now: its own.
        const shown = this.scene.water.wholeState();
        this.serverWater = new TerrainWater();
        if (shown) this.serverWater.receive(shown, this.now());
        this.sentPlace = { place, slots };
        this.sentFast = fast;
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
                        fast,
                        kernel: localWaterKernel(),
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
                port.postMessage(this.catastrophes.state());
            })
            .catch((error: unknown) => {
                // Without its worker the player keeps the ground of the server: the weather of their place still
                // shows, only their lakes do not follow it.
                console.warn("The local ground could not start: the ground of the server is shown", error);
                if (generation !== this.generation) return;
                this.failedKey = key;
                this.letGo(false);
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

    /**
     * Back to the ground of the server: the local one is let go, and the last state of the server shown, its water
     * gliding to it in a second; `said`: the player let their own ground go, and is told so.
     */
    private letGo(said: boolean): void {
        const server = this.serverWater?.wholeState();
        this.destroy();
        this.sentPlace = undefined;
        this.sentMap = undefined;
        if (server) this.scene.water.receive(server, this.now(), BACK_TO_SERVER_GLIDE_MS);
        if (this.serverMeadow) this.scene.showMeadow(this.serverMeadow);
        if (said) this.scene.backToSharedWater();
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

/** Whether two places are the same point of the world, whichever objects hold them; none and none: the map's. */
function samePlaceOrMap(a: WeatherLocation | undefined, b: WeatherLocation | undefined): boolean {
    if (a === undefined || b === undefined) return a === b;
    return a.latitude === b.latitude && a.longitude === b.longitude;
}

/**
 * The meadow of the server without its snow and its ice: they come of the weather of the server, and would stay for
 * hours under the sun of the place chosen. The local ground lays its own, from the weather of that place.
 */
function withoutServerCold(meadow: MeadowState): SeededMeadow {
    const { width, height, grass, moisture, dryness, ash } = meadow;
    return { width, height, grass, moisture, ...(dryness && { dryness }), ...(ash && { ash }) };
}
