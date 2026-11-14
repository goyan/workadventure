import { mulberry32, wanderSeed } from "../Wander/WanderRandom";
import { LEG_MS, TILE_SIZE, wanderLegOffset } from "../Wander/WanderSchedule";

/** One 20 s leg in twelve has a call: every 4 minutes on average, per animal. */
export const JUNGLE_CRY_CHANCE = 1 / 12;
/** Heard up to 12 tiles away, quieter with the distance. */
export const JUNGLE_CRY_RANGE_PX = 12 * TILE_SIZE;
/** At most one call every 20 seconds for a player, whatever the number of animals around: this is an office. */
export const JUNGLE_CRY_COOLDOWN_MS = 20_000;
/** Loudness of a call heard from next to the animal, at a sound effects volume of 100 %. */
export const JUNGLE_MAX_VOLUME = 0.6;

export type JungleSoundKey = "jungle-lion" | "jungle-tigre";

/** The call of each species, played by the Phaser sound manager under its key. */
export const JUNGLE_SOUNDS: readonly { key: JungleSoundKey; url: string }[] = [
    { key: "jungle-lion", url: "/resources/objects/jungle/lion.mp3" },
    { key: "jungle-tigre", url: "/resources/objects/jungle/tigre.mp3" },
];

// The sounds asked for on this page: the cache of Phaser outlives the scenes, a failed file is not asked for again.
const requestedSounds = new Set<string>();

/**
 * Loads the calls that are not in the cache yet, once per page. Called after the preloading of the scene: during it,
 * a file that fails to load shows the network error screen; afterwards, a missing call only means silence.
 */
export function loadJungleSounds(
    load: { audio(key: string, url: string): unknown; start(): void },
    audioCache: { exists(key: string): boolean },
    requested: Set<string> = requestedSounds,
): void {
    let added = false;
    for (const { key, url } of JUNGLE_SOUNDS) {
        if (requested.has(key) || audioCache.exists(key)) continue;
        requested.add(key);
        load.audio(key, url);
        added = true;
    }
    if (added) load.start();
}

/**
 * The number of the current leg of this animal (the legs of its WanderSchedule) when that leg has a call, undefined
 * otherwise. Drawn from the animal id and the leg number only: the same legs for every client.
 */
export function jungleCryLeg(animalId: string, nowMs: number): number | undefined {
    const leg = Math.floor((nowMs + wanderLegOffset(animalId)) / LEG_MS);
    return mulberry32(wanderSeed(animalId, leg, 2000))() < JUNGLE_CRY_CHANCE ? leg : undefined;
}

/** 1 next to the animal, down to 0 at JUNGLE_CRY_RANGE_PX, linearly. */
export function jungleCryVolume(distancePx: number): number {
    return Math.max(0, 1 - distancePx / JUNGLE_CRY_RANGE_PX);
}

/** Lets a call through once per animal and leg, and at most once every JUNGLE_CRY_COOLDOWN_MS for all animals. */
export class JungleCryGate {
    private readonly lastLeg = new Map<string, number>();
    private lastPlayedAt = -Infinity;

    public shouldPlay(animalId: string, leg: number, nowMs: number): boolean {
        if (this.lastLeg.get(animalId) === leg) return false;
        if (nowMs - this.lastPlayedAt < JUNGLE_CRY_COOLDOWN_MS) return false;
        this.lastLeg.set(animalId, leg);
        this.lastPlayedAt = nowMs;
        return true;
    }

    /** Forgets the animals that are gone. */
    public keepOnly(animalIds: ReadonlySet<string>): void {
        for (const id of this.lastLeg.keys()) {
            if (!animalIds.has(id)) this.lastLeg.delete(id);
        }
    }
}

/** The call of a species, from the file name of its sheet (`lion-sheet.png`, possibly in a URL). */
export function jungleSoundKey(sheetPath: string): JungleSoundKey | undefined {
    const fileName = sheetPath.split(/[?#]/)[0].split("/").pop() ?? "";
    if (fileName === "lion-sheet.png") return "jungle-lion";
    if (fileName === "tigre-sheet.png") return "jungle-tigre";
    return undefined;
}

/**
 * Plays a call if its sound is loaded: a missing or broken file (never loaded, decoding failed) plays nothing and
 * throws nothing. The file is not loaded again.
 */
export function playJungleSound(
    sound: { play(key: string, config: { volume: number }): unknown },
    audioCache: { exists(key: string): boolean },
    key: JungleSoundKey,
    volume: number,
): boolean {
    if (volume <= 0 || !audioCache.exists(key)) return false;
    try {
        sound.play(key, { volume });
        return true;
    } catch (e) {
        console.warn("Jungle: cannot play the call", key, e);
        return false;
    }
}
