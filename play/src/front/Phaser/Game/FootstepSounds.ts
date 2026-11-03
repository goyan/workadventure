import type { HearingZone } from "./MapEditor/MapLayer/DoorAnimator";

/** A footstep every this many pixels walked (about two steps per tile). */
const STRIDE = 20;
/** Footsteps stay in the background: one right next to the player plays at this volume, and fades with the distance. */
export const FOOTSTEP_MAX_VOLUME = 0.08;
/** Footsteps farther than this from the local player are silent (8 tiles). */
export const FOOTSTEP_HEARING_DISTANCE = 8 * 32;
/** A jump larger than this between two frames is a teleport or a map change, not walking: no burst of steps. */
const TELEPORT_DISTANCE = 64;

/** Recorded footsteps (CC0, see `resources/objects/footsteps/CREDITS.txt`), played in turn so steps do not sound looped. */
export const FOOTSTEP_SOUNDS = [0, 1, 2, 3].map((index) => ({
    key: `audio-footstep-${index}`,
    url: `/resources/objects/footsteps/footstep-${index}.ogg`,
}));

export interface WalkingCharacter {
    /** Stable identifier: the player's user id, or "local" for the local player. */
    id: string;
    x: number;
    y: number;
}

interface Track {
    x: number;
    y: number;
    walked: number;
}

/**
 * Plays a quiet footstep when a character nearby walks, using the same hearing rule as the doors:
 * only the characters standing in the local player's zones (room, personal desk) are heard.
 */
export class FootstepSounds {
    private readonly tracks = new Map<string, Track>();
    private nextSound = 0;

    constructor(
        private readonly playSound: (key: string, volume: number) => void,
        /** The areas the local player stands in, and their personal desk. */
        private readonly getHearingZones: () => readonly HearingZone[],
    ) {}

    /**
     * @param characters Every character whose steps can be heard, the local player included.
     * @param listener The local player: sets how loud the steps are.
     */
    public update(characters: readonly WalkingCharacter[], listener: WalkingCharacter): void {
        const present = new Set<string>();
        for (const character of characters) {
            present.add(character.id);
            this.track(character, listener);
        }
        for (const id of this.tracks.keys()) {
            if (!present.has(id)) this.tracks.delete(id);
        }
    }

    private track(character: WalkingCharacter, listener: WalkingCharacter): void {
        const track = this.tracks.get(character.id);
        if (!track) {
            this.tracks.set(character.id, { x: character.x, y: character.y, walked: 0 });
            return;
        }
        const moved = Math.hypot(character.x - track.x, character.y - track.y);
        track.x = character.x;
        track.y = character.y;
        if (moved > TELEPORT_DISTANCE) {
            track.walked = 0;
            return;
        }
        track.walked += moved;
        if (track.walked < STRIDE) return;
        track.walked %= STRIDE;
        this.playStep(character, listener);
    }

    private playStep(character: WalkingCharacter, listener: WalkingCharacter): void {
        const distance = Math.hypot(character.x - listener.x, character.y - listener.y);
        if (distance >= FOOTSTEP_HEARING_DISTANCE || !this.isHeard(character, listener)) return;
        const closeness = 1 - distance / FOOTSTEP_HEARING_DISTANCE;
        const sound = FOOTSTEP_SOUNDS[this.nextSound];
        this.nextSound = (this.nextSound + 1) % FOOTSTEP_SOUNDS.length;
        this.playSound(sound.key, FOOTSTEP_MAX_VOLUME * closeness * closeness);
    }

    /** In a room or at a desk, only the steps inside it are heard; in the open, every step nearby is. */
    private isHeard(character: WalkingCharacter, listener: WalkingCharacter): boolean {
        if (character.id === listener.id) return true;
        const zones = this.getHearingZones();
        if (zones.length === 0) return true;
        return zones.some(
            (zone) =>
                character.x >= zone.x &&
                character.x <= zone.x + zone.width &&
                character.y >= zone.y &&
                character.y <= zone.y + zone.height,
        );
    }
}
