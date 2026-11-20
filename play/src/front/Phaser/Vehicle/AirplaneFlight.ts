import { AIRPLANE_ALTITUDE } from "./Vehicle";

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

/** Adds acceleration and height to the velocity computed by the normal vehicle controls. */
export class AirplaneFlight {
    private velocity: Velocity = { x: 0, y: 0 };
    public altitude = 0;
    public landing = false;
    /** The altitude of the glide towards the landing point, set by the pilot on the approach. */
    public glideAltitude: number | undefined;

    public get speed(): Velocity {
        return this.velocity;
    }

    public step(wanted: Velocity, delta: number): FlightStep {
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
        const targetAltitude = this.landing
            ? 0
            : (this.glideAltitude ?? (moving || this.altitude > 0 ? AIRPLANE_ALTITUDE : 0));
        const difference = targetAltitude - this.altitude;
        const rate = gliding ? LANDING_DESCENT : CLIMB_SPEED;
        this.altitude += Math.sign(difference) * Math.min(Math.abs(difference), rate * seconds);
        return { ...this.velocity, altitude: this.altitude, landed: this.landing && this.altitude === 0 };
    }

    public reset(altitude = 0): void {
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
