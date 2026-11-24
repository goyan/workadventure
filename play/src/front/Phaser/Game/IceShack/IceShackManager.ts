import { get } from "svelte/store";
import type { Subscription } from "rxjs";
import {
    ICE_SHACK_CRACK_MS,
    ICE_SHACK_REACH_PX,
    ICE_SHACK_READY_MS,
    iceShackAt,
    iceShackEventOfWire,
    iceShackPlacement,
    iceShackSeat,
    iceShackSite,
} from "@workadventure/map-editor";
import type { IceShack, IceShackEvent, IceShackPlacement, IceShackSite } from "@workadventure/map-editor";
import { IceShackAction, PositionMessage_Direction } from "@workadventure/messages";
import type { IceShacksMessage } from "@workadventure/messages";
import LL from "../../../../i18n/i18n-svelte";
import { rodEquippedStore, showFishingCard } from "../../../Stores/FishingStore";
import { toggleHandTool } from "../../../Stores/HandToolStore";
import { iceShackLightsStore } from "../../../Stores/IceShackStore";
import type { RgbLampLight } from "../../../Stores/RgbLampStore";
import type { WokaMenuAction } from "../../../Stores/WokaMenuStore";
import { mapEditorModeStore } from "../../../Stores/MapEditorStore";
import { LAMP_DISC_TEXTURE } from "../Lamps/LampTextures";
import type { Seat } from "../../Player/Seat";
import { findSeatOfCharacter } from "../../Player/Seat";
import type { GameScene } from "../GameScene";
import { joinedUserId } from "../Jungle/JungleCompanions";
import { iceUnderfoot } from "../Ice/FrozenWater";
import { followsServerGround } from "../Weather/GroundSource";
import { clientShackGround } from "./IceShackGround";
import { FLOOR, GLOW, shackPhase } from "./IceShackShapes";
import { IceShackView } from "./IceShackView";
import type { ShackShown } from "./IceShackView";

/** The system asks for less motion: the smoke stays still. */
const REDUCED_MOTION = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
/** How long a shack takes to fold down when it goes (ms). */
const FOLD_MS = 1000;
/** The events told on a card, with their text. */
const CARD_EVENTS = new Set<IceShackEvent>([
    "noIce",
    "thinIce",
    "shallow",
    "pool",
    "tooClose",
    "onePerPlayer",
    "roomFull",
    "object",
    "notOnGround",
    "occupied",
    "tooFar",
    "notOwner",
    "notReady",
    "cracking",
    "collapsed",
    "dismantled",
    "unknown",
]);
type CardEvent = Exclude<IceShackEvent, "abandoned" | "built" | "entered" | "left">;

interface KnownShack {
    id: number;
    x: number;
    y: number;
    ownerName: string;
    ownerUserId: number;
    occupantUserId: number;
    /** When it was started, on the clock of this browser. */
    builtAt: number;
    /** When its ice gives way, on the clock of this browser; undefined while it bears it. */
    givesWayAt?: number;
}

/** The id of the seat of a shack, and of the "object" it belongs to (no object of the map: it is not in the WAM). */
export function iceShackSeatId(shackId: number): string {
    return `ice-shack:${shackId}`;
}

/**
 * The ice fishing shacks of the room as this browser shows them, and what the local player does with them (the
 * server decides everything, see IceShackManager in back): put one up from the own-avatar wheel, sit on its stool
 * (from the wheel, or with the interaction key as on any seat), fish through its hole with the ordinary fishing line,
 * get up, take it down. The stool of a shack is a seat among the seats of the map (Seat.ts): who sits there is seen
 * seated by every player without a message of its own.
 */
export class IceShackManager {
    private readonly view: IceShackView;
    private readonly shacks = new Map<number, KnownShack>();
    /** The shacks that just went, folding down a moment. */
    private folding: { shack: KnownShack; since: number }[] = [];
    private readonly subscription: Subscription | undefined;
    /** The shack the local player asked to sit in, until the server answers. */
    private enterAsked: number | undefined;
    /** The shack the local player was seated in by this browser once it was up (who put it up sits in it). */
    private seatedOnce: number | undefined;
    /**
     * The shack the local player sits in now, the server agreeing: the rod came in hand and the help was shown for this
     * sitting. Forgotten once they got up, so that sitting again (or after being sat there as it went up) gives both
     * again; it was one with `seatedOnce`, and who put a shack up, or sat again in the same one, sat without a rod:
     * SPACE then did nothing.
     */
    private sittingIn: number | undefined;
    /** The shack the local player was told to leave. */
    private leaveAsked: number | undefined;
    private lightsKey = "";

    constructor(
        private readonly scene: GameScene,
        joined: IceShacksMessage | undefined,
        /** The wind of the air of the map near the ground, map pixels a second (see groundWind). */
        private readonly wind: () => { x: number; y: number },
    ) {
        this.view = new IceShackView(scene, REDUCED_MOTION);
        if (joined) this.receive(joined);
        this.subscription = scene.connection?.iceShacksMessageStream.subscribe((message) => this.receive(message));
    }

    /** The stools of the shacks that are up and bear their ice: seats of the map (Seat.ts). */
    public seats(): Seat[] {
        const now = Date.now();
        const toFeet = this.scene.CurrentPlayer?.getPositionForFeet({ x: 0, y: 0 }) ?? { x: 0, y: 0 };
        const seats: Seat[] = [];
        for (const shack of this.shacks.values()) {
            if (now - shack.builtAt < ICE_SHACK_READY_MS || shack.givesWayAt !== undefined) continue;
            const seat = iceShackSeat(shack);
            const feet = { x: seat.x - toFeet.x, y: seat.y - toFeet.y };
            const id = iceShackSeatId(shack.id);
            seats.push({
                id,
                entityId: id,
                direction: PositionMessage_Direction.RIGHT,
                // Before its walls, behind the posts of its open front (IceShackView).
                depth: shack.y + 2,
                trigger: "key",
                feet,
                reach: { x: feet.x - 12, y: feet.y - 12, width: 24, height: 24 },
                image: {
                    x: shack.x + FLOOR.left,
                    y: shack.y + FLOOR.top - 42,
                    width: FLOOR.right - FLOOR.left,
                    height: FLOOR.bottom - FLOOR.top + 42,
                },
                elevation: 0,
            });
        }
        return seats;
    }

    /** The hole the local player fishes through: seated in a shack the server seated them in. */
    public ownHole(): { x: number; y: number } | undefined {
        const shack = this.seatedShack();
        const ownId = joinedUserId(this.scene.connection);
        return shack && ownId !== undefined && shack.occupantUserId === ownId ? { x: shack.x, y: shack.y } : undefined;
    }

    /** What the local player may do with the shacks from the own-avatar wheel: greyed with the reason when refused. */
    public wheelActions(): WokaMenuAction[] {
        const player = this.scene.CurrentPlayer;
        const ownId = joinedUserId(this.scene.connection);
        if (!player || ownId === undefined || get(mapEditorModeStore)) return [];
        const texts = get(LL).actionbar.iceShack;
        const personal = !followsServerGround();
        const actions: WokaMenuAction[] = [];
        const near = this.nearest(player.x, player.y);
        if (near) {
            const now = Date.now();
            const seatedHere = this.seatedShack()?.id === near.id;
            if (near.occupantUserId === ownId || seatedHere) {
                actions.push({
                    actionName: texts.leave(),
                    icon: "iceShack",
                    testId: "avatar-ice-shack-leave",
                    callback: () => this.leave(near),
                });
            } else {
                const reason =
                    near.occupantUserId !== 0
                        ? texts.occupiedBy({ name: this.nameOf(near.occupantUserId) })
                        : now - near.builtAt < ICE_SHACK_READY_MS
                          ? texts.notReady()
                          : near.givesWayAt !== undefined
                            ? texts.thinIce()
                            : personal
                              ? texts.personal()
                              : undefined;
                actions.push({
                    actionName: near.ownerUserId === ownId ? texts.enter() : texts.enterOf({ name: near.ownerName }),
                    icon: "iceShack",
                    testId: "avatar-ice-shack-enter",
                    disabled: reason !== undefined,
                    detail: reason,
                    callback: () => {
                        player.sitOnSeat(iceShackSeatId(near.id));
                    },
                });
            }
            if (near.ownerUserId === ownId) {
                actions.push({
                    actionName: texts.dismantle(),
                    icon: "iceShack",
                    testId: "avatar-ice-shack-dismantle",
                    callback: () => {
                        if (seatedHere) player.standUp();
                        this.scene.connection?.emitIceShackAction(IceShackAction.ICE_SHACK_DISMANTLE, near.id);
                    },
                });
            }
            return actions;
        }
        // Only on the ice: from the wheel of an avatar that stands on it.
        if (!this.onIce(player.x, player.y)) return [];
        const reason = personal ? texts.personal() : this.buildRefusal(player.x, player.y, player.getFloorZ(), ownId);
        actions.push({
            actionName: texts.build(),
            icon: "iceShack",
            testId: "avatar-ice-shack-build",
            disabled: reason !== undefined,
            detail: reason,
            callback: () => this.scene.connection?.emitIceShackAction(IceShackAction.ICE_SHACK_BUILD),
        });
        return actions;
    }

    public update(time: number): void {
        const now = Date.now();
        this.followSeat(now);
        this.folding = this.folding.filter((fold) => now - fold.since < FOLD_MS);
        const night = this.scene.getNightActive();
        const shown: ShackShown[] = [];
        const lights: RgbLampLight[] = [];
        for (const shack of this.shacks.values()) {
            const age = now - shack.builtAt;
            const { phase, progress } = shackPhase(age);
            const occupied = shack.occupantUserId !== 0 && phase === "standing";
            shown.push({
                id: shack.id,
                x: shack.x,
                y: shack.y,
                look: {
                    raised: phase === "drilling" ? 0 : progress,
                    drilled: phase === "drilling" ? progress : 1,
                    occupied,
                    ...(phase === "drilling" ? { augerMs: Math.floor(age / 120) * 120 } : {}),
                    ...(shack.givesWayAt === undefined
                        ? {}
                        : {
                              cracking:
                                  Math.round(10 * (1 - Math.max(0, shack.givesWayAt - now) / ICE_SHACK_CRACK_MS)) / 10,
                          }),
                },
                smoking: occupied,
                drop: this.scene.surfaceDropAt(shack.x, shack.y),
            });
            if (occupied) {
                lights.push({
                    id: `ice-shack:${shack.id}`,
                    x: shack.x + GLOW.x - GLOW.radius,
                    y: shack.y + GLOW.y - GLOW.radius,
                    size: GLOW.radius * 2,
                    textureKey: LAMP_DISC_TEXTURE,
                    revision: 0,
                    intensity: 0.8,
                    elevation: 0,
                });
            }
        }
        for (const { shack, since } of this.folding) {
            shown.push({
                id: -shack.id,
                x: shack.x,
                y: shack.y,
                look: { raised: 1 - (now - since) / FOLD_MS, drilled: 1, occupied: false },
                smoking: false,
                drop: this.scene.surfaceDropAt(shack.x, shack.y),
            });
        }
        this.view.update(shown, time, this.wind(), night);
        const lightsKey = lights.map((light) => light.id).join(",");
        if (lightsKey !== this.lightsKey) {
            this.lightsKey = lightsKey;
            iceShackLightsStore.set(lights);
        }
        if (shown.length > 0) this.scene.markDirty();
    }

    public destroy(): void {
        this.subscription?.unsubscribe();
        this.view.destroy();
        iceShackLightsStore.set([]);
    }

    private receive(message: IceShacksMessage): void {
        const now = Date.now();
        const ownId = joinedUserId(this.scene.connection);
        const before = new Map(this.shacks);
        // The stool the player sat on before this message: a shack that cracks has none any more.
        const seatedBefore = this.seatedShack();
        this.shacks.clear();
        for (const shack of message.shacks) {
            this.shacks.set(shack.id, {
                id: shack.id,
                x: shack.x,
                y: shack.y,
                ownerName: shack.ownerName,
                ownerUserId: shack.ownerUserId,
                occupantUserId: shack.occupantUserId,
                builtAt: now - shack.ageMs,
                givesWayAt: shack.crackingMs > 0 ? now + shack.crackingMs : undefined,
            });
        }
        for (const wire of message.events) {
            const event = iceShackEventOfWire(wire.type);
            const own = ownId !== undefined && wire.userId === ownId;
            const gone = before.get(wire.shackId);
            if ((event === "collapsed" || event === "dismantled" || event === "abandoned") && gone) {
                this.folding.push({ shack: gone, since: now });
            }
            if (event === "entered" || event === "left" || event === "built") {
                if (own) this.enterAsked = undefined;
                continue;
            }
            if (own) {
                this.enterAsked = undefined;
                // Refused, or the ice cracks under them: who sits on the stool gets up.
                if (seatedBefore?.id === wire.shackId) this.scene.CurrentPlayer.standUp();
            }
            // A shack that collapsed is told to who put it up as well.
            const told = own || (event === "collapsed" && gone !== undefined && gone.ownerUserId === ownId);
            if (told && this.isCardEvent(event)) {
                showFishingCard({ kind: "iceShack", own: true, text: get(LL).actionbar.iceShack[event]() });
            }
        }
        this.scene.markDirty();
    }

    private isCardEvent(event: IceShackEvent): event is CardEvent {
        return CARD_EVENTS.has(event);
    }

    /**
     * Follows the seat of the local player: seated on the stool of a shack, the server is asked to seat them there
     * (and the rod comes in hand); got up, the server is told. Who put a shack up sits on its stool once it is up.
     */
    private followSeat(now: number): void {
        const player = this.scene.CurrentPlayer;
        const ownId = joinedUserId(this.scene.connection);
        const connection = this.scene.connection;
        if (!player || ownId === undefined || !connection) return;
        const seated = this.seatedShack();
        if (seated && seated.occupantUserId !== ownId) {
            if (!followsServerGround()) {
                player.standUp();
                showFishingCard({ kind: "iceShack", own: true, text: get(LL).actionbar.iceShack.personal() });
            } else if (this.enterAsked !== seated.id && seated.occupantUserId === 0) {
                this.enterAsked = seated.id;
                connection.emitIceShackAction(IceShackAction.ICE_SHACK_ENTER, seated.id);
            }
        }
        if (seated && seated.occupantUserId === ownId) {
            this.leaveAsked = undefined;
            // Seated there: not sat again by this browser once they walk off.
            this.seatedOnce = seated.id;
            if (this.sittingIn !== seated.id) {
                this.sittingIn = seated.id;
                // In the shack the rod is in hand: SPACE lets the line down the hole (FishingManager).
                if (!get(rodEquippedStore)) toggleHandTool("rod");
                showFishingCard({ kind: "iceShack", own: true, text: get(LL).actionbar.iceShack.help() });
            }
        } else this.sittingIn = undefined;
        for (const shack of this.shacks.values()) {
            if (shack.occupantUserId !== ownId || seated?.id === shack.id) continue;
            if (now - shack.builtAt < ICE_SHACK_READY_MS) continue;
            if (this.seatedOnce !== shack.id) {
                // Who put it up stands on its stool: they sit as it is up.
                this.seatedOnce = shack.id;
                if (player.sitOnSeat(iceShackSeatId(shack.id))) continue;
            }
            if (this.leaveAsked !== shack.id && !this.slidingTo(shack)) {
                this.leaveAsked = shack.id;
                connection.emitIceShackAction(IceShackAction.ICE_SHACK_LEAVE, shack.id);
            }
        }
    }

    /** Whether the local player is on their way to the stool of a shack (sitOnSeat slides there). */
    private slidingTo(shack: KnownShack): boolean {
        const seat = iceShackSeat(shack);
        const player = this.scene.CurrentPlayer;
        return !player.isSeated() && Math.hypot(player.x - seat.x, player.y - seat.y) <= 2;
    }

    private leave(shack: KnownShack): void {
        const player = this.scene.CurrentPlayer;
        if (this.seatedShack()?.id === shack.id) player.standUp();
        this.leaveAsked = shack.id;
        this.scene.connection?.emitIceShackAction(IceShackAction.ICE_SHACK_LEAVE, shack.id);
    }

    /** The shack whose stool the local player sits on. */
    private seatedShack(): KnownShack | undefined {
        const player = this.scene.CurrentPlayer;
        if (!player?.isSeated()) return undefined;
        const seatId = findSeatOfCharacter(this.scene, player)?.id;
        for (const shack of this.shacks.values()) if (iceShackSeatId(shack.id) === seatId) return shack;
        return undefined;
    }

    /** The shack whose stool is within reach of a point (map pixels), the nearest. */
    private nearest(x: number, y: number): KnownShack | undefined {
        let nearest: { shack: KnownShack; distance: number } | undefined;
        for (const shack of this.shacks.values()) {
            const seat = iceShackSeat(shack);
            const distance = Math.hypot(seat.x - x, seat.y - y);
            if (distance <= ICE_SHACK_REACH_PX && (!nearest || distance < nearest.distance)) {
                nearest = { shack, distance };
            }
        }
        return nearest?.shack;
    }

    /** Whether the local player stands on ice: the ice of the server, or the ice of their own weather. */
    private onIce(x: number, y: number): boolean {
        if (followsServerGround()) return (this.scene.getMeadow()?.iceAtPoint(x, y) ?? 0) > 0;
        return iceUnderfoot(this.scene, { x, y }) !== "none";
    }

    /** Why the server would refuse a shack put up from there, as this browser knows the ice; undefined if it would not. */
    private buildRefusal(x: number, y: number, floorZ: number, ownId: number): string | undefined {
        const texts = get(LL).actionbar.iceShack;
        if (floorZ !== 0) return texts.notOnGround();
        const hole = iceShackAt({ x, y });
        const site: IceShackSite = iceShackSite(hole, clientShackGround(this.scene));
        if (site !== "ok") return texts[site]();
        const known: IceShack[] = [...this.shacks.values()].map((shack) => ({
            id: shack.id,
            x: shack.x,
            y: shack.y,
            // The keys of the players are not told: who put a shack up is known by their id in the room.
            ownerKey: shack.ownerUserId === ownId ? "own" : `shack-${shack.id}`,
            ownerName: shack.ownerName,
            builtAt: 0,
            ownerSeenAt: 0,
        }));
        const objects = Object.values(this.scene.getGameMap()?.getWamFile()?.getWam().entities ?? {});
        const placement: IceShackPlacement | undefined = iceShackPlacement(known, hole, "own", objects);
        return placement ? texts[placement]() : undefined;
    }

    private nameOf(userId: number): string {
        if (userId === joinedUserId(this.scene.connection)) return this.scene.CurrentPlayer.playerName;
        return this.scene.MapPlayersByKey.get(userId)?.playerName ?? "?";
    }
}
