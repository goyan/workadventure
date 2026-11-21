import { MAX_TAMED, SPECIES } from "@workadventure/map-editor";
import { JungleCompanionFollower } from "../Jungle/JungleCompanionFollow";
import { COMPANION_PROMPT_PX } from "../Jungle/JungleCompanions";
import type { Point, WanderPose } from "../Wander/WanderSchedule";
import type { AquaticLife, ShownAnimal } from "./AquaticLife";
import { landSpeciesOf } from "./LandSprites";

/** Everything the companions of the land read from and do in the game: injected, so they are tested without Phaser. */
export interface LandCompanionWorld {
    /** The user id of the local player, set by the server; undefined before the connection. */
    localUserId(): number | undefined;
    /** The feet of a player this client sees (the local one, or a remote one in view); undefined otherwise. */
    playerFeet(userId: number): Point | undefined;
    playerInWater(userId: number): boolean;
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
    /** Whether the local player stands on the ground, where the animals are. */
    playerOnGround(): boolean;
    /** Whether the player shows the animals of the land (the switch of the jungle). */
    shown(): boolean;
    /** How many wandering animals (dogs, cats, ducks) the local player has tamed: one group, one limit. */
    otherCompanions(): number;
    /** Asks the server for an animal; it answers in what it next tells of the life. */
    tame(animalId: number): void;
    /** Lets go one animal of the local player, or all of them. */
    release(animalId?: number): void;
    showPrompt(kind: "tame" | "release", action: () => void): void;
    hidePrompt(): void;
}

const tamable = (kind: number): boolean => {
    const species = landSpeciesOf(kind);
    return species !== undefined && SPECIES[species].tamable;
};

/**
 * The lions and the tigers of the life of the land that players tamed. The server alone says whose an animal is
 * (`owner` in what it tells of the life); this shows the animal behind its master rather than where the server keeps
 * it (see JungleCompanionFollower, as for the wandering animals), offers the interaction key next to a free one
 * (tame) or to one's own (let go), and asks the server. Nothing is decided here.
 */
export class LandCompanions {
    private readonly followers = new Map<number, { owner: number; follower: JungleCompanionFollower | undefined }>();
    /** The place of each led animal in the group of its master. */
    private slots = new Map<number, number>();
    private prompt: { kind: "tame" | "release"; animal: number } | undefined;
    private mine = 0;
    /** Whether the server was asked to let all go since the editor opened. */
    private releasedForEditor = false;

    constructor(
        private readonly life: AquaticLife,
        private readonly world: LandCompanionWorld,
    ) {}

    /** Called every frame, before the animals are drawn. */
    public update(nowMs: number): void {
        const animals = this.life.shown(nowMs, false);
        const localId = this.world.localUserId();
        const counts = new Map<number, number>();
        const slots = new Map<number, number>();
        const led = new Set<number>();
        let mine = 0;
        // In the order of their ids: the same places on every screen.
        for (const animal of [...animals].sort((a, b) => a.id - b.id)) {
            if (animal.owner === undefined) continue;
            led.add(animal.id);
            if (animal.owner === localId) mine++;
            // The wandering companions of the local player have the first places of their group.
            const first = animal.owner === localId ? this.world.otherCompanions() : 0;
            const place = counts.get(animal.owner) ?? 0;
            slots.set(animal.id, first + place);
            counts.set(animal.owner, place + 1);
            const entry = this.followers.get(animal.id);
            if (entry?.owner !== animal.owner) {
                this.followers.set(animal.id, {
                    owner: animal.owner,
                    follower: new JungleCompanionFollower({ x: animal.x, y: animal.y }, nowMs),
                });
            }
        }
        for (const id of this.followers.keys()) if (!led.has(id)) this.followers.delete(id);
        this.slots = slots;
        this.mine = mine;
        if (!this.world.editorOpen()) this.releasedForEditor = false;
        else if (mine > 0 && !this.releasedForEditor) {
            // No companion in the map editor.
            this.releasedForEditor = true;
            this.world.release();
        }
        this.updatePrompt(animals, nowMs, localId);
    }

    /**
     * Where a tamed animal is shown: behind its master; "hidden" while they are out of view (it went with them);
     * undefined for a free animal, shown where the server says. While its master flies it stays on the ground where
     * it was (the server keeps it there too), and walks back to them once they landed.
     */
    public poseOf(animalId: number, nowMs: number): WanderPose | "hidden" | undefined {
        const entry = this.followers.get(animalId);
        if (!entry) return undefined;
        const feet = this.world.playerFeet(entry.owner);
        if (!feet) {
            // Back in view, it is at their feet, not where it was last seen.
            entry.follower = undefined;
            return "hidden";
        }
        const flying = this.world.playerFlying?.(entry.owner) ?? false;
        // Nobody here saw where it was left on the ground: shown where the server keeps it (its last place there).
        if (!entry.follower && flying) return undefined;
        entry.follower ??= new JungleCompanionFollower(feet, nowMs);
        const pose = entry.follower.poseAt(
            nowMs,
            feet,
            !this.world.playerInWater(entry.owner),
            this.slots.get(animalId) ?? 0,
            flying,
        );
        if (!flying) {
            entry.follower.seekWayBack(
                nowMs,
                feet,
                (from, to) => this.world.groundPath?.(from, to) ?? Promise.resolve([to]),
            );
        }
        return pose;
    }

    /** How many animals of the land follow the local player. */
    public get tamedCount(): number {
        return this.mine;
    }

    /** Lets every animal of the local player go (from the wheel of their avatar). */
    public releaseAll(): void {
        if (this.mine > 0) this.world.release();
    }

    public destroy(): void {
        this.followers.clear();
        this.hidePrompt();
    }

    private updatePrompt(animals: readonly ShownAnimal[], nowMs: number, localId: number | undefined): void {
        const feet = localId === undefined ? undefined : this.world.playerFeet(localId);
        if (!feet || this.world.editorOpen() || !this.world.playerOnGround() || !this.world.shown()) {
            this.hidePrompt();
            return;
        }
        const canTame = this.mine + this.world.otherCompanions() < MAX_TAMED;
        let wanted: { kind: "tame" | "release"; animal: number } | undefined;
        let best = Number.POSITIVE_INFINITY;
        for (const animal of animals) {
            if (!tamable(animal.kind) || animal.alpha < 1) continue;
            const kind =
                animal.owner === localId ? "release" : animal.owner === undefined && canTame ? "tame" : undefined;
            if (!kind) continue;
            // Where the player sees it.
            const pose = this.poseOf(animal.id, nowMs) ?? animal;
            if (pose === "hidden") continue;
            const distance = Math.hypot(pose.x - feet.x, pose.y - feet.y);
            if (distance <= COMPANION_PROMPT_PX && distance < best) {
                best = distance;
                wanted = { kind, animal: animal.id };
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
            if (target.kind === "tame") this.world.tame(target.animal);
            else this.world.release(target.animal);
        });
    }

    private hidePrompt(): void {
        if (!this.prompt) return;
        this.prompt = undefined;
        this.world.hidePrompt();
    }
}
