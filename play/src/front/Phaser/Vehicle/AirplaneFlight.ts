import { AIRPLANE_ALTITUDE, AIRPLANE_MAX_ALTITUDE, AIRPLANE_MIN_FLIGHT_ALTITUDE } from "./Vehicle";

interface Velocity {
    x: number;
    y: number;
}
export interface FlightStep extends Velocity {
    altitude: number;
    landed: boolean;
}

const ACCELERATION = 600;
const BRAKING = 450;
const CLIMB_SPEED = 240;
/** On the way down the plane follows its glide: faster than a climb, so that a landing stays short. */
const LANDING_DESCENT = 900;
/** The climb or descent of the pilot (space, control): full speed in 0.4 s, and as long to stop once let go. */
const PILOT_VERTICAL_SPEED = 480;
const PILOT_VERTICAL_ACCELERATION = 1200;

/** Adds acceleration and height to the velocity computed by the normal vehicle controls. */
export class AirplaneFlight {
    private velocity: Velocity = { x: 0, y: 0 };
    public altitude = 0;
    public landing = false;
    /** The altitude of the glide towards the landing point, set by the pilot on the approach. */
    public glideAltitude: number | undefined;
    /** The altitude the plane flies at: the cruise one, until the pilot climbs or comes down. */
    public cruise = AIRPLANE_ALTITUDE;
    /** How fast the pilot makes the plane climb (> 0) or come down, eased in and out. */
    private verticalSpeed = 0;

    public get speed(): Velocity {
        return this.velocity;
    }

    /** `climb`: the pilot climbs (1), comes down (-1) or leaves the altitude alone (0); ignored during a landing. */
    public step(wanted: Velocity, delta: number, climb: -1 | 0 | 1 = 0): FlightStep {
        const seconds = Math.max(0, Math.min(100, delta)) / 1000;
        const target = this.landing ? { x: 0, y: 0 } : wanted;
        const dx = target.x - this.velocity.x;
        const dy = target.y - this.velocity.y;
        const distance = Math.hypot(dx, dy);
        const acceleration = target.x || target.y ? ACCELERATION : BRAKING;
        const share = distance > 0 ? Math.min(1, (acceleration * seconds) / distance) : 1;
        this.velocity = { x: this.velocity.x + dx * share, y: this.velocity.y + dy * share };
        const moving = Math.hypot(this.velocity.x, this.velocity.y) > 0.1;
        const gliding = this.landing || this.glideAltitude !== undefined;
        if (this.pilotClimb(gliding ? 0 : climb, gliding, seconds)) {
            return { ...this.velocity, altitude: this.altitude, landed: false };
        }
        const targetAltitude = this.landing
            ? 0
            : (this.glideAltitude ?? (moving || this.altitude > 0 ? this.cruise : 0));
        const difference = targetAltitude - this.altitude;
        const rate = gliding ? LANDING_DESCENT : CLIMB_SPEED;
        this.altitude += Math.sign(difference) * Math.min(Math.abs(difference), rate * seconds);
        return { ...this.velocity, altitude: this.altitude, landed: this.landing && this.altitude === 0 };
    }

    /**
     * The pilot's climb or descent, eased in and out: the altitude follows it, and stays where it ends. Never under the
     * lowest flight level (nor under the altitude of a plane still below it), never over the highest. Returns whether
     * the pilot is moving the plane up or down.
     */
    private pilotClimb(climb: -1 | 0 | 1, gliding: boolean, seconds: number): boolean {
        if (gliding) {
            this.verticalSpeed = 0;
            return false;
        }
        const wanted = climb * PILOT_VERTICAL_SPEED;
        const change = wanted - this.verticalSpeed;
        this.verticalSpeed += Math.sign(change) * Math.min(Math.abs(change), PILOT_VERTICAL_ACCELERATION * seconds);
        if (this.verticalSpeed === 0) return false;
        const lowest = Math.min(this.altitude, AIRPLANE_MIN_FLIGHT_ALTITUDE);
        const next = this.altitude + this.verticalSpeed * seconds;
        const altitude = Math.max(lowest, Math.min(AIRPLANE_MAX_ALTITUDE, next));
        if (altitude !== next) this.verticalSpeed = 0;
        this.altitude = altitude;
        if (altitude > 0) this.cruise = altitude;
        return true;
    }

    public reset(altitude = 0): void {
        this.cruise = AIRPLANE_ALTITUDE;
        this.verticalSpeed = 0;
        this.velocity = { x: 0, y: 0 };
        this.altitude = altitude;
        this.landing = false;
        this.glideAltitude = undefined;
    }

    public cancelLanding(): void {
        this.landing = false;
        this.glideAltitude = undefined;
        this.altitude = Math.max(16, this.altitude);
    }
}
