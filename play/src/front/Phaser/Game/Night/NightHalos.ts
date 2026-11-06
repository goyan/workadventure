/** Radius of the light around a still player (1.5 tiles). */
export const NIGHT_HALO_IDLE_RADIUS_PX = 48;
/** Radius of the light around a moving player (3 tiles). */
export const NIGHT_HALO_MOVING_RADIUS_PX = 96;
/** Duration of a full change between both radii (linear). */
export const NIGHT_HALO_TRANSITION_MS = 300;
/** A player counts as moving if its position changed within this delay. */
export const NIGHT_HALO_MOVING_WINDOW_MS = 200;

const RADIUS_PER_MS = (NIGHT_HALO_MOVING_RADIUS_PX - NIGHT_HALO_IDLE_RADIUS_PX) / NIGHT_HALO_TRANSITION_MS;

/** A circle of light to cut out of the night veil, centred on a player's body. */
export interface Halo {
    id: string;
    x: number;
    y: number;
    radius: number;
}

interface HaloState {
    x: number;
    y: number;
    radius: number;
    lastMoveAt: number | undefined;
}

/**
 * Light around every known player at night, wider while the player moves. Movement is deduced from the positions
 * seen at each update: nothing is sent on the network.
 */
export class NightHalos {
    private readonly states = new Map<string, HaloState>();
    private lastNow: number | undefined;
    private animating = false;

    /** players: id + raw position (the body, not the feet). Returns one halo per present player. */
    public update(now: number, players: readonly { id: string; x: number; y: number }[]): Halo[] {
        const dt = this.lastNow === undefined ? 0 : now - this.lastNow;
        this.lastNow = now;
        const step = dt * RADIUS_PER_MS;

        const halos: Halo[] = [];
        const present = new Set<string>();
        this.animating = false;
        for (const player of players) {
            present.add(player.id);
            let state = this.states.get(player.id);
            if (state === undefined) {
                // A player seen for the first time is still: nothing tells it moved.
                state = { x: player.x, y: player.y, radius: NIGHT_HALO_IDLE_RADIUS_PX, lastMoveAt: undefined };
                this.states.set(player.id, state);
            } else if (state.x !== player.x || state.y !== player.y) {
                state.x = player.x;
                state.y = player.y;
                state.lastMoveAt = now;
            }

            const moving = state.lastMoveAt !== undefined && now - state.lastMoveAt <= NIGHT_HALO_MOVING_WINDOW_MS;
            if (moving) {
                state.radius = Math.min(NIGHT_HALO_MOVING_RADIUS_PX, state.radius + step);
            } else {
                state.radius = Math.max(NIGHT_HALO_IDLE_RADIUS_PX, state.radius - step);
            }
            const target = moving ? NIGHT_HALO_MOVING_RADIUS_PX : NIGHT_HALO_IDLE_RADIUS_PX;
            if (moving || state.radius !== target) {
                this.animating = true;
            }
            halos.push({ id: player.id, x: state.x, y: state.y, radius: state.radius });
        }

        for (const id of this.states.keys()) {
            if (!present.has(id)) {
                this.states.delete(id);
            }
        }
        return halos;
    }

    /** Whether a radius is still changing or a player moved within the window (redraw needed next frame). */
    public isAnimating(): boolean {
        return this.animating;
    }

    /** Forgets every player and the time of the last update, like NightLights.reset after a hidden period. */
    public reset(): void {
        this.states.clear();
        this.lastNow = undefined;
        this.animating = false;
    }
}
