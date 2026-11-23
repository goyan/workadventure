import { ballRadiusPx, coldCelsius, coldTiles } from "@workadventure/map-editor";
import { hurricaneTrack } from "@workadventure/map-editor";
import type { Ball, ColdMass, Downpour, Drain, Hurricane } from "@workadventure/map-editor";
import { CatastropheKind } from "@workadventure/messages";
import type { CatastropheMessage } from "@workadventure/messages";
import type { LocalTerrainCommand } from "./LocalTerrainSimulation";

/** What the relay tells the local ground of the catastrophes of the room. */
export type LocalCatastropheCommand = Extract<
    LocalTerrainCommand,
    { kind: "catastrophes" | "strike" | "shatter" | "ignite" | "burn" | "soak" | "calm" }
>;
type CatastropheState = Extract<LocalTerrainCommand, { kind: "catastrophes" }>;

/**
 * The catastrophes of the room, as the server tells them to this browser (CatastropheMessage), turned into what the
 * local ground of the player does with them (LocalTerrainSimulation): the server acts on its own water as it tells
 * them (CatastropheManager), the local ground the same, on its water. What falls lands after its fall
 * (`impactInMs`): the meteor strikes, the fireball burns. The ice breaks and the fire is set at once; a downpour
 * soaks the meadow each time it is told. The downpours, the drains, the balls and the cold snaps go on as long as the server tells
 * them (`impactInMs` more each time; a ball let go: 0), and the local ground is told their list when it changes.
 * `now`: a clock in ms, the game's.
 */
export class LocalCatastropheRelay {
    private readonly downpours = new Map<number, { downpour: Downpour; until: number }>();
    private readonly drains = new Map<number, { drain: Drain; until: number }>();
    private readonly balls = new Map<number, { ball: Ball; until: number }>();
    private readonly colds = new Map<number, { cold: ColdMass; until: number }>();
    /** The hurricane crossing the map, until it ends or is stopped (its weather is computed from it). */
    private hurricane: { hurricane: Hurricane; until: number } | undefined;
    private falls: { at: number; command: LocalCatastropheCommand }[] = [];
    private changed = false;

    /** A message of the server: what acts at once on the local ground. */
    public receive(message: CatastropheMessage, now: number): LocalCatastropheCommand[] {
        const { id, x, y, radiusTiles } = message;
        const until = now + message.impactInMs;
        switch (message.kind) {
            case CatastropheKind.CATASTROPHE_METEOR:
                this.falls.push({ at: until, command: { kind: "strike", x, y, radiusTiles } });
                return [];
            case CatastropheKind.CATASTROPHE_FIREBALL:
                this.falls.push({ at: until, command: { kind: "burn", x, y, radiusTiles, id } });
                return [];
            case CatastropheKind.CATASTROPHE_ICE_BREAK:
                return [{ kind: "shatter", x, y, radiusTiles }];
            case CatastropheKind.CATASTROPHE_FIRE:
                return [{ kind: "ignite", x, y, radiusTiles }];
            case CatastropheKind.CATASTROPHE_DOWNPOUR: {
                const downpour = { id, x, y, radiusTiles, wholeMap: message.wholeMap };
                this.downpours.set(id, { downpour, until });
                this.changed = true;
                return [{ kind: "soak", downpour: { x, y, radiusTiles, wholeMap: message.wholeMap } }];
            }
            case CatastropheKind.CATASTROPHE_DRAIN:
                this.drains.set(id, { drain: { id, x, y, radiusTiles }, until });
                this.changed = true;
                return [];
            case CatastropheKind.CATASTROPHE_BALL:
                if (message.impactInMs <= 0) this.balls.delete(id);
                else this.balls.set(id, { ball: { id, x, y, radiusPx: ballRadiusPx(radiusTiles) }, until });
                this.changed = true;
                return [];
            case CatastropheKind.CATASTROPHE_COLD: {
                // The cold snap of the room was stopped: the local ground dispels its cold air too.
                if (message.impactInMs <= 0) {
                    if (this.colds.size > 0) this.changed = true;
                    this.colds.clear();
                    return [{ kind: "calm" }];
                }
                const cold = {
                    id,
                    x,
                    y,
                    radiusTiles: coldTiles(radiusTiles),
                    temperature: coldCelsius(message.temperature),
                };
                this.colds.set(id, { cold, until });
                this.changed = true;
                return [];
            }
            case CatastropheKind.CATASTROPHE_HURRICANE: {
                const track = message.hurricane;
                if (message.impactInMs <= 0 || !track) {
                    if (this.hurricane) this.changed = true;
                    this.hurricane = undefined;
                    return [];
                }
                const known = this.hurricane?.hurricane;
                const hurricane = {
                    id,
                    startedAt: track.startedAt,
                    ...hurricaneTrack(track, track.southern),
                    fromX: track.fromX,
                    fromY: track.fromY,
                    toX: track.toX,
                    toY: track.toY,
                    anchorX: track.anchorX,
                    anchorY: track.anchorY,
                };
                // Told again each second: the local ground is told only when it is another one.
                if (!known || known.id !== id || known.startedAt !== hurricane.startedAt) this.changed = true;
                this.hurricane = { hurricane, until };
                return [];
            }
            default:
                return [];
        }
    }

    /** At each image: what landed since, and the list of what goes on when it changed (or ended). */
    public due(now: number): LocalCatastropheCommand[] {
        const landed = this.falls.filter((fall) => fall.at <= now);
        if (landed.length > 0) this.falls = this.falls.filter((fall) => fall.at > now);
        const commands = landed.map((fall) => fall.command);
        const going = [this.downpours, this.drains, this.balls, this.colds] as Map<number, { until: number }>[];
        for (const kept of going) {
            for (const [id, { until }] of kept) {
                if (until <= now) {
                    kept.delete(id);
                    this.changed = true;
                }
            }
        }
        if (this.hurricane && this.hurricane.until <= now) {
            this.hurricane = undefined;
            this.changed = true;
        }
        if (this.changed) {
            this.changed = false;
            commands.push(this.state());
        }
        return commands;
    }

    /** The downpours, the drains and the balls going on: what a local ground that starts is told. */
    public state(): CatastropheState {
        return {
            kind: "catastrophes",
            downpours: [...this.downpours.values()].map(({ downpour }) => downpour),
            drains: [...this.drains.values()].map(({ drain }) => drain),
            balls: [...this.balls.values()].map(({ ball }) => ball),
            // The masses of cold air held; the local ground keeps those let go while they warm, as the server does.
            ...(this.colds.size > 0 ? { colds: [...this.colds.values()].map(({ cold }) => cold) } : {}),
            ...(this.hurricane ? { hurricane: this.hurricane.hurricane } : {}),
        };
    }
}
