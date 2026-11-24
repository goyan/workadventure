import type { WanderLead } from "../Wander/WanderingCharactersManager";
import type { Point } from "../Wander/WanderSchedule";
import { JungleCompanionFollower } from "./JungleCompanionFollow";
import {
    JUNGLE_COMPANION_ANNOUNCE_MS,
    JUNGLE_COMPANION_EXPIRY_MS,
    JUNGLE_MAX_COMPANIONS,
    JungleCompanionClaims,
    decodeJungleCompanion,
    jungleCompanionOwners,
} from "./JungleCompanionProtocol";
import type { JungleCompanionClaim, JungleCompanionMessage } from "./JungleCompanionProtocol";
import type { JungleAnimal } from "./JunglePlan";

/** The interaction key tames an animal whose feet are this close to the player's: a tile and a half. */
export const COMPANION_PROMPT_PX = 48;
/**
 * An animal seen with the same master for that long stays with them (see jungleCompanionOwners): longer than a crossed
 * message takes, shorter than anyone would notice.
 */
export const COMPANION_HOLD_MS = 3_000;
/** Closer than this in altitude, a player and an animal stand on the same floor (as for the bubbles, see FloorLevel). */
export const SAME_FLOOR_PX = 6;
/** The companions are announced again at once to a player who arrives, at most that often. */
const ARRIVAL_ANNOUNCE_MS = 1_000;

/** Everything the companions read from and do in the game: injected, so that they are tested without Phaser. */
/**
 * The user id of the local player, undefined until the room is joined. `RoomConnection.getUserId` throws before that,
 * and an exception in the update of the scene stops the game loop for good (a blank page).
 */
export function joinedUserId(connection: { getUserId(): number } | undefined): number | undefined {
    try {
        return connection?.getUserId();
    } catch {
        return undefined;
    }
}

export interface JungleCompanionWorld {
    /** The user id of the local player, set by the server; undefined before the connection. */
    localUserId(): number | undefined;
    /** The feet of a player this client sees (the local one, or a remote one in view); undefined otherwise. */
    playerFeet(userId: number): Point | undefined;
    playerInWater(userId: number): boolean;
    /** The jungle animals of the map now (see JungleManager). */
    animals(): readonly JungleAnimal[];
    /**
     * Where an animal is shown on the screen, undefined while it is not; with `z`, the altitude of the floor or the
     * stair it stands on (it is drawn that much further north than its feet are on the ground).
     */
    animalPose(id: string): Point | undefined;
    /**
     * The altitude of the floor a player this client sees stands on (0: the ground); undefined when they stand on
     * none (flying). With it, an animal is tamed and released from its own floor only, and a companion goes up
     * the stairs behind its master; without it, everything is on the ground (see playerOnGround).
     */
    playerFloorZ?(userId: number): number | undefined;
    /**
     * Whether a player this client sees flies (in a plane). A companion does not fly: it stays on the ground where it
     * was, and walks back to its master once they landed.
     */
    playerFlying?(userId: number): boolean;
    /**
     * A way on the ground between two places (see Point), [] when there is none: the one a companion walks back to
     * a master who landed. Without it, it walks straight to them.
     */
    groundPath?(from: Point, to: Point): Promise<Point[]>;
    editorOpen(): boolean;
    /** Whether the local player stands on the ground, where the animals are (not on a raised floor over them). */
    playerOnGround?(): boolean;
    /** How many animals of the life of the map (lions, tigers the server runs) follow the local player: one limit. */
    otherCompanions?(): number;
    /** The server clock (the computer's until it is known), in ms. */
    serverNow(): number;
    /** Tells the whole room. */
    send(message: JungleCompanionMessage): void;
    setLead(animalId: string, lead: WanderLead | undefined): void;
    showPrompt(kind: "tame" | "release", action: () => void): void;
    hidePrompt(): void;
}

/**
 * Tamed jungle animals: the interaction key next to a free animal tames it, next to one of one's companions releases
 * it (the nearest animal within reach is the one the key acts on). A companion follows its master on every client, at
 * its place in the small group behind them (see JungleCompanionFollower), and wanders no more; up to
 * JUNGLE_MAX_COMPANIONS per player, and an animal tamed by someone cannot be tamed by another. Nothing is saved: the
 * companions are released when their master leaves the map or reloads the page (their claims are not announced any more
 * and expire).
 */
export class JungleCompanions {
    private readonly others = new JungleCompanionClaims();
    /** The companions of the local player, in the order they were tamed: when each one was. */
    private readonly local = new Map<string, number>();
    private lastAnnounce = 0;
    /** The master each led animal follows, and its place in their group. */
    private readonly led = new Map<
        string,
        { owner: number; sheetPath: string | undefined; slot: number; lead: WanderLead | undefined }
    >();
    private prompt: { kind: "tame" | "release"; animal: string } | undefined;
    /** The clock of the last update. */
    private nowMs = 0;
    /** The master each animal has had on this screen, and since when (the page's clock). */
    private readonly holders = new Map<string, { owner: number; from: number }>();
    /** Whether this player told the room anything: on a map without an animal to tame, it never does. */
    private greeted = false;
    private lastArrivalAnnounce = Number.NEGATIVE_INFINITY;

    constructor(private readonly world: JungleCompanionWorld) {}

    /** The way a companion left on the ground walks back to its master (see JungleCompanionFollower.seekWayBack). */
    private readonly wayBack = (from: Point, to: Point): Promise<Point[]> =>
        this.world.groundPath?.(from, to) ?? Promise.resolve([to]);

    /** A room event: claims of the other players. */
    public receive(senderId: number | undefined, name: string, data: unknown, nowMs: number): void {
        const message = decodeJungleCompanion(name, data);
        // The server sends the room events back to their sender too.
        if (!message || senderId === undefined || senderId === this.world.localUserId()) return;
        this.others.receive(senderId, message, nowMs);
        // An empty list is a player arriving (or releasing everything): they learn about the companions now, not at
        // the next announce, which would leave them seeing these animals wander for a few seconds.
        if (
            message.companions.length === 0 &&
            this.local.size > 0 &&
            nowMs - this.lastArrivalAnnounce >= ARRIVAL_ANNOUNCE_MS
        ) {
            this.lastArrivalAnnounce = nowMs;
            if (nowMs - this.lastAnnounce > JUNGLE_COMPANION_EXPIRY_MS) {
                // Not announced for too long (see announce): the others let them go, so does this player.
                this.releaseAll();
                return;
            }
            this.lastAnnounce = nowMs;
            this.sendLocal();
        }
    }

    /** Called every frame (the page's clock, for the expiry of the claims). */
    public update(nowMs: number): void {
        this.nowMs = nowMs;
        const animals = new Map(this.world.animals().map((animal) => [animal.id, animal]));
        if (!this.greeted && animals.size > 0) {
            // A claim of a former connection of this player (a reconnection without reloading) is over; and the
            // masters in the room announce their companions to this new player.
            this.greeted = true;
            this.sendLocal();
        }
        const localId = this.world.localUserId();
        if (this.local.size > 0 && this.world.editorOpen()) {
            // No companion in the map editor.
            this.releaseAll();
        }
        // An animal gone from the jungle (switched off, a new day) is free.
        this.dropLocal([...this.local.keys()].filter((animal) => !animals.has(animal)));
        const claims: JungleCompanionClaim[] = this.others.claims(nowMs).filter((claim) => animals.has(claim.animal));
        if (localId !== undefined) {
            for (const [animal, since] of this.local) claims.push({ owner: localId, animal, since });
        }
        const held = new Map<string, number>();
        for (const [animal, holder] of this.holders) {
            if (nowMs - holder.from >= COMPANION_HOLD_MS) held.set(animal, holder.owner);
        }
        const owners = jungleCompanionOwners(claims, held);
        for (const animal of this.holders.keys()) if (!owners.has(animal)) this.holders.delete(animal);
        for (const [animal, { owner }] of owners) {
            if (this.holders.get(animal)?.owner !== owner) this.holders.set(animal, { owner, from: nowMs });
        }
        // Someone tamed it first: their message crossed ours. Given up without a word.
        this.dropLocal([...this.local.keys()].filter((animal) => owners.get(animal)?.owner !== localId));
        this.announce(nowMs);
        this.updateLeads(owners, animals);
        this.updatePrompt(owners, animals);
    }

    /**
     * Tells the room about the companions when it is time: called every frame and by a timer of its own, as the frames
     * stop in a hidden tab. After a gap longer than the expiry (a tab hidden long, its timers slowed down), the others
     * have let the companions go: so does this player.
     */
    public announce(nowMs: number): void {
        if (this.local.size === 0 || nowMs - this.lastAnnounce < JUNGLE_COMPANION_ANNOUNCE_MS) return;
        if (nowMs - this.lastAnnounce > JUNGLE_COMPANION_EXPIRY_MS) {
            this.releaseAll();
            return;
        }
        this.lastAnnounce = nowMs;
        this.sendLocal();
    }

    public get tamedCount(): number {
        return this.local.size;
    }

    /** Lets every companion of the local player go (from the wheel of their avatar). */
    public releaseAll(): void {
        if (this.local.size === 0) return;
        this.local.clear();
        this.sendLocal();
    }

    /** The page goes away (reload, tab closed): the companions are released at once rather than when they expire. */
    public releaseNow(): void {
        if (this.local.size > 0) this.releaseAll();
    }

    public destroy(): void {
        this.local.clear();
        if (this.greeted) this.sendLocal();
        for (const animal of this.led.keys()) this.world.setLead(animal, undefined);
        this.led.clear();
        this.hidePrompt();
    }

    private tame(animal: string): void {
        if (this.local.has(animal) || !this.hasRoom() || this.world.editorOpen()) return;
        // The action may be called late (a prompt of a former frame): the animal must still be within reach and free.
        if (!this.withinReach(animal) || this.others.claims(this.nowMs).some((claim) => claim.animal === animal))
            return;
        this.local.set(animal, this.world.serverNow());
        this.lastAnnounce = this.nowMs;
        this.sendLocal();
    }

    /** Whether the local player may tame one more animal, those of the life of the map counted. */
    private hasRoom(): boolean {
        return this.local.size + (this.world.otherCompanions?.() ?? 0) < JUNGLE_MAX_COMPANIONS;
    }

    private withinReach(animal: string): boolean {
        const localId = this.world.localUserId();
        const feet = localId === undefined ? undefined : this.world.playerFeet(localId);
        const pose = this.world.animalPose(animal);
        if (!feet || !pose || !this.world.animals().some((candidate) => candidate.id === animal)) return false;
        return this.onFloorOfPlayer(pose) && Math.hypot(pose.x - feet.x, pose.y - feet.y) <= COMPANION_PROMPT_PX;
    }

    /**
     * Whether an animal shown there stands on the floor of the local player: next to each other on the screen, two
     * floors apart, they are out of reach.
     */
    private onFloorOfPlayer(pose: Point): boolean {
        if (!this.world.playerFloorZ) return this.world.playerOnGround?.() !== false;
        const localId = this.world.localUserId();
        const z = localId === undefined ? undefined : this.world.playerFloorZ(localId);
        return z !== undefined && Math.abs((pose.z ?? 0) - z) < SAME_FLOOR_PX;
    }

    /** Where a player stands: their feet on the ground, with the altitude of their floor (see Point). */
    private placeOfPlayer(feet: Point, userId: number): Point {
        const z = this.world.playerFloorZ?.(userId) ?? 0;
        return z > 0 ? { x: feet.x, y: feet.y + z, z } : feet;
    }

    private release(animal: string): void {
        this.dropLocal([animal]);
    }

    /** Lets these companions go, and tells the room about the ones left (once, only if one was dropped). */
    private dropLocal(animals: string[]): void {
        let dropped = false;
        for (const animal of animals) dropped = this.local.delete(animal) || dropped;
        if (dropped) this.sendLocal();
    }

    private sendLocal(): void {
        this.world.send({ companions: [...this.local].map(([animal, since]) => ({ animal, since })) });
    }

    private updateLeads(owners: Map<string, JungleCompanionClaim>, animals: Map<string, JungleAnimal>): void {
        // The place of each companion in the group of its master: in the order they were tamed.
        const slots = new Map<string, number>();
        const counts = new Map<number, number>();
        const ordered = [...owners.values()].sort(
            (a, b) => a.since - b.since || (a.animal < b.animal ? -1 : a.animal > b.animal ? 1 : 0),
        );
        for (const claim of ordered) {
            const slot = counts.get(claim.owner) ?? 0;
            slots.set(claim.animal, slot);
            counts.set(claim.owner, slot + 1);
        }
        for (const [animal, entry] of this.led) {
            // Another species on the same tree (a new day) is a new character of the wandering ones: led again.
            if (owners.get(animal)?.owner === entry.owner && animals.get(animal)?.sheetPath === entry.sheetPath) {
                entry.slot = slots.get(animal) ?? 0;
                // Given again every frame (nothing happens when it has it): a character made anew (a placed object
                // edited, the map reloaded) is led again at once.
                if (entry.lead) this.world.setLead(animal, entry.lead);
                continue;
            }
            this.led.delete(animal);
            this.world.setLead(animal, undefined);
        }
        for (const [animal, { owner }] of owners) {
            if (this.led.has(animal)) continue;
            // From where it is shown, as a place on the ground (see Point).
            const shown = this.world.animalPose(animal);
            const start = shown
                ? (shown.z ?? 0) > 0
                    ? { x: shown.x, y: shown.y + (shown.z ?? 0), z: shown.z }
                    : shown
                : (animals.get(animal)?.nest ?? { x: 0, y: 0 });
            let follower: JungleCompanionFollower | undefined = new JungleCompanionFollower(start, this.nowMs);
            const entry: { owner: number; sheetPath: string | undefined; slot: number; lead: WanderLead | undefined } =
                { owner, sheetPath: animals.get(animal)?.sheetPath, slot: slots.get(animal) ?? 0, lead: undefined };
            this.led.set(animal, entry);
            entry.lead = {
                poseAt: (nowMs) => {
                    const feet = this.world.playerFeet(owner);
                    if (!feet) {
                        // Its master is out of view: so is it, neither here nor around its nest. Back in view, it is
                        // at their feet (it went with them), not where it was last seen.
                        follower = undefined;
                        return undefined;
                    }
                    const master = this.placeOfPlayer(feet, owner);
                    const flying = this.world.playerFlying?.(owner) ?? false;
                    // Nobody here saw where it was left on the ground: not shown until its master lands.
                    if (!follower && flying) return undefined;
                    follower ??= new JungleCompanionFollower(master, nowMs);
                    const pose = follower.poseAt(nowMs, master, !this.world.playerInWater(owner), entry.slot, flying);
                    if (!flying) follower.seekWayBack(nowMs, master, this.wayBack);
                    return pose;
                },
            };
            this.world.setLead(animal, entry.lead);
        }
    }

    private updatePrompt(owners: Map<string, JungleCompanionClaim>, animals: Map<string, JungleAnimal>): void {
        const localId = this.world.localUserId();
        const feet = localId === undefined ? undefined : this.world.playerFeet(localId);
        if (!feet || this.world.editorOpen()) {
            this.hidePrompt();
            return;
        }
        // The nearest animal within reach the key can act on: one of the companions (released), or a free animal
        // (tamed) while there is room for one more.
        const canTame = this.hasRoom();
        let wanted: { kind: "tame" | "release"; animal: string } | undefined;
        let best = Number.POSITIVE_INFINITY;
        for (const animal of animals.keys()) {
            const kind = this.local.has(animal) ? "release" : !owners.has(animal) && canTame ? "tame" : undefined;
            if (!kind) continue;
            const pose = this.world.animalPose(animal);
            if (!pose || !this.onFloorOfPlayer(pose)) continue;
            const distance = Math.hypot(pose.x - feet.x, pose.y - feet.y);
            if (distance <= COMPANION_PROMPT_PX && distance < best) {
                best = distance;
                wanted = { kind, animal };
            }
        }
        if (!wanted) {
            this.hidePrompt();
            return;
        }
        if (this.prompt?.kind === wanted.kind && this.prompt.animal === wanted.animal) return;
        this.hidePrompt();
        this.prompt = wanted;
        const target = wanted;
        this.world.showPrompt(target.kind, () => {
            this.hidePrompt();
            if (target.kind === "tame") this.tame(target.animal);
            else this.release(target.animal);
        });
    }

    private hidePrompt(): void {
        if (!this.prompt) return;
        this.prompt = undefined;
        this.world.hidePrompt();
    }
}
