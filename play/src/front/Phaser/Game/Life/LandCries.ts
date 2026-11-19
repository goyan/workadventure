import { JUNGLE_MAX_VOLUME, JungleCryGate, jungleCryLeg, jungleCryVolume } from "../Jungle/JungleCries";
import type { JungleSoundKey } from "../Jungle/JungleCries";
import type { LandSpecies } from "./LandSprites";

/** A lion or a tiger of the life of the land, as this browser shows it. */
export interface HeardAnimal {
    id: number;
    species: LandSpecies;
    x: number;
    y: number;
    moving: boolean;
    /** Tamed: it follows its master, and calls no more. */
    led: boolean;
}

/** What the calls read from the game and do in it (the same as for the animals of the jungle). */
export interface LandHearing {
    listener(): { x: number; y: number } | undefined;
    /** A hidden tab plays nothing. */
    hidden(): boolean;
    /** The volume of the calls of the jungle, 0 to 1. */
    volume(): number;
    play(key: JungleSoundKey, volume: number): void;
}

const SOUNDS: Partial<Record<LandSpecies, JungleSoundKey>> = { lion: "jungle-lion", tiger: "jungle-tigre" };

/** The name of an animal of the life for its calls: the legs that have one are drawn from it. */
export const landCryId = (id: number): string => `land:${id}`;

/**
 * The calls of the lions and of the tigers the server runs: those of the jungle (see JungleManager.update), from
 * time to time while the animal stands still, heard up to twelve tiles away, one every twenty seconds at most. Each
 * browser plays them for itself, drawn from the id of the animal and the time: nothing is sent.
 */
export class LandCries {
    private readonly gate = new JungleCryGate();

    constructor(private readonly hearing: LandHearing) {}

    public update(nowMs: number, animals: Iterable<HeardAnimal>): void {
        if (this.hearing.hidden()) return;
        const listener = this.hearing.listener();
        if (!listener) return;
        const seen = new Set<string>();
        for (const animal of animals) {
            const id = landCryId(animal.id);
            seen.add(id);
            const key = SOUNDS[animal.species];
            if (!key || animal.moving || animal.led) continue;
            const leg = jungleCryLeg(id, nowMs);
            if (leg === undefined) continue;
            const volume =
                jungleCryVolume(Math.hypot(animal.x - listener.x, animal.y - listener.y)) *
                JUNGLE_MAX_VOLUME *
                this.hearing.volume();
            if (volume <= 0 || !this.gate.shouldPlay(id, leg, nowMs)) continue;
            this.hearing.play(key, volume);
        }
        this.gate.keepOnly(seen);
    }
}
