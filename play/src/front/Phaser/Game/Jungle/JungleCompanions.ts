import type { WanderLead } from "../Wander/WanderingCharactersManager";
import type { Point } from "../Wander/WanderSchedule";
import { JungleCompanionFollower } from "./JungleCompanionFollow";
import {
    JUNGLE_COMPANION_ANNOUNCE_MS,
    JungleCompanionClaims,
    decodeJungleCompanion,
    jungleCompanionOwners,
} from "./JungleCompanionProtocol";
import type { JungleCompanionClaim, JungleCompanionMessage } from "./JungleCompanionProtocol";
import type { JungleAnimal } from "./JunglePlan";

/** The interaction key tames an animal whose feet are this close to the player's: a tile and a half. */
export const COMPANION_PROMPT_PX = 48;

const RELEASED: JungleCompanionMessage = { animal: null, since: 0 };

/** Everything the companions read from and do in the game: injected, so that they are tested without Phaser. */
export interface JungleCompanionWorld {
    /** The user id of the local player, set by the server; undefined before the connection. */
    localUserId(): number | undefined;
    /** The feet of a player this client sees (the local one, or a remote one in view); undefined otherwise. */
    playerFeet(userId: number): Point | undefined;
    playerInWater(userId: number): boolean;
    /** The jungle animals of the map now (see JungleManager). */
    animals(): readonly JungleAnimal[];
    /** Where an animal is shown, undefined while it is not. */
    animalPose(id: string): Point | undefined;
    editorOpen(): boolean;
    /** The server clock (the computer's until it is known), in ms. */
    serverNow(): number;
    /** Tells the whole room. */
    send(message: JungleCompanionMessage): void;
    setLead(animalId: string, lead: WanderLead | undefined): void;
    showPrompt(kind: "tame" | "release", action: () => void): void;
    hidePrompt(): void;
}

/**
 * Tamed jungle animals: the interaction key next to a free animal tames it, next to one's companion releases it.
 * A companion follows its master on every client (see JungleCompanionFollower) and wanders no more; one companion per
 * player, and an animal tamed by someone cannot be tamed by another. Nothing is saved: a companion is released when its
 * master leaves the map or reloads the page (their claim is not announced any more and expires).
 */
export class JungleCompanions {
    private readonly others = new JungleCompanionClaims();
    private local: { animal: string; since: number } | undefined;
    private lastAnnounce = 0;
    /** The master each led animal follows, with its follower. */
    private readonly led = new Map<string, { owner: number; sheetPath: string | undefined }>();
    private prompt: { kind: "tame" | "release"; animal: string } | undefined;
    /** The clock of the last update. */
    private nowMs = 0;

    constructor(private readonly world: JungleCompanionWorld) {
        // A claim of a former connection of this player (a reconnection without reloading) is over.
        world.send(RELEASED);
    }

    /** A room event: claims of the other players. */
    public receive(senderId: number | undefined, name: string, data: unknown, nowMs: number): void {
        const message = decodeJungleCompanion(name, data);
        // The server sends the room events back to their sender too.
        if (!message || senderId === undefined || senderId === this.world.localUserId()) return;
        this.others.receive(senderId, message, nowMs);
    }

    /** Called every frame (the page's clock, for the expiry of the claims). */
    public update(nowMs: number): void {
        this.nowMs = nowMs;
        const animals = new Map(this.world.animals().map((animal) => [animal.id, animal]));
        const localId = this.world.localUserId();
        if (this.local && (this.world.editorOpen() || !animals.has(this.local.animal))) {
            // No companion in the map editor; and an animal gone from the jungle (switched off, a new day) is free.
            this.release();
        }
        const claims: JungleCompanionClaim[] = this.others.claims(nowMs).filter((claim) => animals.has(claim.animal));
        if (this.local && localId !== undefined) claims.push({ owner: localId, ...this.local });
        const owners = jungleCompanionOwners(claims);
        if (this.local && owners.get(this.local.animal) !== localId) {
            // Someone tamed it first: their message crossed ours. Given up without a word.
            this.release();
        }
        if (this.local && nowMs - this.lastAnnounce >= JUNGLE_COMPANION_ANNOUNCE_MS) {
            this.lastAnnounce = nowMs;
            this.world.send({ animal: this.local.animal, since: this.local.since });
        }
        this.updateLeads(owners, animals);
        this.updatePrompt(owners, animals);
    }

    public destroy(): void {
        if (this.local) this.release();
        else this.world.send(RELEASED);
        for (const animal of this.led.keys()) this.world.setLead(animal, undefined);
        this.led.clear();
        this.hidePrompt();
    }

    private tame(animal: string): void {
        if (this.local || this.world.editorOpen()) return;
        this.local = { animal, since: this.world.serverNow() };
        this.lastAnnounce = this.nowMs;
        this.world.send({ animal, since: this.local.since });
    }

    private release(): void {
        this.local = undefined;
        this.world.send(RELEASED);
    }

    private updateLeads(owners: Map<string, number>, animals: Map<string, JungleAnimal>): void {
        for (const [animal, entry] of this.led) {
            // Another species on the same tree (a new day) is a new character of the wandering ones: led again.
            if (owners.get(animal) === entry.owner && animals.get(animal)?.sheetPath === entry.sheetPath) continue;
            this.led.delete(animal);
            this.world.setLead(animal, undefined);
        }
        for (const [animal, owner] of owners) {
            if (this.led.has(animal)) continue;
            const start = this.world.animalPose(animal) ?? animals.get(animal)?.nest ?? { x: 0, y: 0 };
            const follower = new JungleCompanionFollower(start, this.nowMs);
            this.led.set(animal, { owner, sheetPath: animals.get(animal)?.sheetPath });
            this.world.setLead(animal, {
                poseAt: (nowMs) => {
                    const feet = this.world.playerFeet(owner);
                    // Its master is out of view: so is it, neither here nor around its nest.
                    if (!feet) return undefined;
                    return follower.poseAt(nowMs, feet, !this.world.playerInWater(owner));
                },
            });
        }
    }

    private updatePrompt(owners: Map<string, number>, animals: Map<string, JungleAnimal>): void {
        const localId = this.world.localUserId();
        const feet = localId === undefined ? undefined : this.world.playerFeet(localId);
        if (!feet || this.world.editorOpen()) {
            this.hidePrompt();
            return;
        }
        const near = (animal: string): boolean => {
            const pose = this.world.animalPose(animal);
            return pose !== undefined && Math.hypot(pose.x - feet.x, pose.y - feet.y) <= COMPANION_PROMPT_PX;
        };
        let wanted: { kind: "tame" | "release"; animal: string } | undefined;
        if (this.local) {
            if (near(this.local.animal)) wanted = { kind: "release", animal: this.local.animal };
        } else {
            let best = Number.POSITIVE_INFINITY;
            for (const animal of animals.keys()) {
                if (owners.has(animal)) continue;
                const pose = this.world.animalPose(animal);
                if (!pose) continue;
                const distance = Math.hypot(pose.x - feet.x, pose.y - feet.y);
                if (distance <= COMPANION_PROMPT_PX && distance < best) {
                    best = distance;
                    wanted = { kind: "tame", animal };
                }
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
            else if (this.local?.animal === target.animal) this.release();
        });
    }

    private hidePrompt(): void {
        if (!this.prompt) return;
        this.prompt = undefined;
        this.world.hidePrompt();
    }
}
