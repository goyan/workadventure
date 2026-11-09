import type { HearingZone } from "./MapEditor/MapLayer/DoorAnimator";
import { FOOTSTEP_SURFACES } from "./FootstepSurfaces";
import type { FootstepSurface } from "./FootstepSurfaces";

/** A footstep every this many pixels walked (about two steps per tile), give or take STRIDE_JITTER. */
const STRIDE = 20;
const STRIDE_JITTER = 3;
/** Each step is a little higher or lower (in cents) and softer than the last, so a walk never sounds looped. */
const MAX_DETUNE = 120;
const MIN_VOLUME_RATIO = 0.7;
/** A step on the side is heard on that side, never fully in one ear. */
const MAX_PAN = 0.6;
/** Maximum gain at 100%; the personal volume starts at 15% and distance further softens steps. */
export const FOOTSTEP_MAX_VOLUME = 0.3;
/** Keep nearby players audible at a very low level, independently of personal steps. */
const OTHER_PLAYER_VOLUME_RATIO = 0.05;
/** Footsteps farther than this from the local player are silent (8 tiles). */
export const FOOTSTEP_HEARING_DISTANCE = 8 * 32;
/** A jump larger than this between two frames is a teleport or a map change, not walking: no burst of steps. */
const TELEPORT_DISTANCE = 64;

/** Recordings per surface (CC0, see `resources/objects/footsteps/CREDITS.txt`), picked at random so steps do not sound looped. */
const VARIANTS_PER_SURFACE = 5;
export const FOOTSTEP_SOUNDS = [
    ...FOOTSTEP_SURFACES.flatMap((surface) =>
        Array.from({ length: VARIANTS_PER_SURFACE }, (_, index) => ({
            key: footstepSoundKey(surface, index),
            url: `/resources/objects/footsteps/${surface}-${index}.ogg`,
        })),
    ),
    // Strokes of a swimmer, generated for WorkAdventure (see CREDITS.txt).
    ...Array.from({ length: VARIANTS_PER_SURFACE }, (_, index) => ({
        key: footstepSoundKey("water", index),
        url: `/resources/objects/footsteps/water-${index}.wav`,
    })),
];

function footstepSoundKey(surface: FootstepSurface, variant: number): string {
    return `audio-footstep-${surface}-${variant}`;
}

export interface WalkingCharacter {
    /** Stable identifier: the player's user id, or "local" for the local player. */
    id: string;
    x: number;
    y: number;
    /** Swimming: its strokes sound like water, whatever the floor under the pool. */
    swimming?: boolean;
}

export interface FootstepPlayback {
    volume: number;
    /** Pitch shift, in cents. */
    detune: number;
    /** -1 left, 1 right. */
    pan: number;
}

interface Track {
    x: number;
    y: number;
    walked: number;
    /** Distance to walk before the next step: STRIDE, with a bit of irregularity. */
    stride: number;
}

/**
 * Plays a quiet footstep when a character nearby walks, using the same hearing rule as the doors:
 * only the characters standing in the local player's zones (room, personal desk) are heard.
 */
export class FootstepSounds {
    private readonly tracks = new Map<string, Track>();
    private lastVariant = -1;

    constructor(
        private readonly playSound: (key: string, playback: FootstepPlayback) => void,
        /** The areas the local player stands in, and their personal desk. */
        private readonly getHearingZones: () => readonly HearingZone[],
        /** What the floor is made of at a position: each surface has its own sound. */
        private readonly getSurfaceAt: (x: number, y: number) => FootstepSurface,
        private readonly random: () => number = Math.random,
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
            this.tracks.set(character.id, { x: character.x, y: character.y, walked: 0, stride: this.nextStride() });
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
        if (track.walked < track.stride) return;
        track.walked %= track.stride;
        track.stride = this.nextStride();
        this.playStep(character, listener);
    }

    private playStep(character: WalkingCharacter, listener: WalkingCharacter): void {
        const distance = Math.hypot(character.x - listener.x, character.y - listener.y);
        if (distance >= FOOTSTEP_HEARING_DISTANCE || !this.isHeard(character, listener)) return;
        const closeness = 1 - distance / FOOTSTEP_HEARING_DISTANCE;
        const loudness = MIN_VOLUME_RATIO + (1 - MIN_VOLUME_RATIO) * this.random();
        const surface = character.swimming ? "water" : this.getSurfaceAt(character.x, character.y);
        this.playSound(footstepSoundKey(surface, this.nextVariant()), {
            volume:
                FOOTSTEP_MAX_VOLUME *
                (character.id === listener.id ? 1 : OTHER_PLAYER_VOLUME_RATIO) *
                closeness *
                closeness *
                loudness,
            detune: (this.random() * 2 - 1) * MAX_DETUNE,
            pan: Math.max(-1, Math.min(1, (character.x - listener.x) / FOOTSTEP_HEARING_DISTANCE)) * MAX_PAN,
        });
    }

    /** A random recording of the surface, never the one just played. */
    private nextVariant(): number {
        const isFirst = this.lastVariant < 0;
        const variant = Math.floor(this.random() * (VARIANTS_PER_SURFACE - (isFirst ? 0 : 1)));
        this.lastVariant = !isFirst && variant >= this.lastVariant ? variant + 1 : variant;
        return this.lastVariant;
    }

    private nextStride(): number {
        return STRIDE + (this.random() * 2 - 1) * STRIDE_JITTER;
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
