import type * as Phaser from "phaser";
import { drinkStance } from "../Wander/WanderDrink";
import type { WanderDirection } from "../Wander/WanderSchedule";
import { WANDER_FRAME_SIZE, WANDER_WALK_COLUMNS, wanderIdleFrame, wanderWalkFrames } from "../Wander/WanderSheet";
import { placeAtDepth } from "../DepthSort";
import { floorDepth } from "../MapEditor/MapLayer/FloorDepth";
import type { AquaticLife, ShownAnimal } from "./AquaticLife";
import { ensureLandTexture, landSpeciesOf } from "./LandSprites";
import type { LandSpecies } from "./LandSprites";

/** An animal this close to the screen counts as on it. */
const MARGIN_PX = 48;
/** A step of the walk lasts this long. */
const WALK_FRAME_MS = 150;
/** Under this many pixels between two frames an animal stands still. */
const STILL_PX = 0.05;
/** The state the server tells for an animal that drinks. */
const DRINKING = 3;
/** A sheet of the catalogue has four rows of frames. */
const SHEET_ROWS = 4;

/** Where an animal faces after moving by (dx, dy): the larger axis wins; it keeps its side when it did not move. */
export function directionOf(dx: number, dy: number, previous: WanderDirection): WanderDirection {
    if (Math.abs(dx) < STILL_PX && Math.abs(dy) < STILL_PX) return previous;
    if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? "left" : "right";
    return dy < 0 ? "up" : "down";
}

/** The frame of a sheet of the catalogue for an animal that walks or stands. */
export function landFrame(direction: WanderDirection, moving: boolean, now: number, columns: number): number {
    if (!moving) return wanderIdleFrame(direction, columns);
    const frames = wanderWalkFrames(direction, columns);
    return frames[Math.floor(now / WALK_FRAME_MS) % frames.length];
}

interface Shown {
    sprite: Phaser.GameObjects.Sprite;
    direction: WanderDirection;
    /** How many columns the sheet it is drawn with has; undefined while it is drawn with the texture made here. */
    columns: number | undefined;
    species: LandSpecies;
    moving: boolean;
    /** Tamed: drawn behind its master. */
    led: boolean;
    /**
     * Where the life had it at the last frame, not rounded: the sprite sits on whole pixels, and what the rounding
     * leaves is larger than a slow step, so a heading read against the sprite turns at every frame.
     */
    atX: number;
    atY: number;
    /** Since when it drinks, undefined while it does not. */
    drinkingSince: number | undefined;
    /** How much lower than its place it is drawn (the relief seen in 3/4). */
    drop: number;
}

type SceneOfView = Pick<Phaser.Scene, "add" | "cameras" | "textures" | "load"> & { markDirty(): void };

/**
 * Draws the animals of the land the server runs (antelopes, lions, tigers): a sprite each, where the life says,
 * among the avatars (its depth is its place), walking towards where it goes. A lion and a tiger use the sheet of
 * the catalogue of the animals when the map has it; an antelope, and they until the sheet is loaded, a small image
 * drawn here. Nothing is drawn while the player hides the jungle.
 */
export class LandLifeView {
    private readonly shown = new Map<number, Shown>();
    private readonly requested = new Set<string>();

    constructor(
        private readonly scene: SceneOfView,
        private readonly life: AquaticLife,
        private readonly isShown: () => boolean,
        private readonly reducedMotion: () => boolean,
        /** The sheet of a species in the catalogues of the map, when it has one. */
        private readonly sheetOf: (species: LandSpecies) => string | undefined,
        /**
         * Where a tamed animal is shown instead of where the server says: behind its master (see LandCompanions),
         * "hidden" while they are out of view; undefined for a free animal.
         */
        private readonly lead: (
            animal: ShownAnimal,
            now: number,
        ) =>
            | {
                  x: number;
                  y: number;
                  direction: WanderDirection;
                  moving: boolean;
                  /**
                   * How much lower it is drawn there, when it is not as much as the ground: nothing while its master
                   * stands on a raised floor or a deck, where it stands too.
                   */
                  drop?: number;
              }
            | "hidden"
            | undefined = () => undefined,
        /** Whether there is grass to graze at a point of the map (map pixels): an antelope standing there eats. */
        private readonly grassAt: (x: number, y: number) => boolean = () => false,
        /** How high over the ground one walks above a point of the ground (map pixels): the bridges of the map. */
        private readonly liftAt: (x: number, y: number) => number = () => 0,
        /** How much lower the ground at a point is drawn, the relief seen in 3/4 (GameScene.groundDropAt). */
        private readonly dropAt: (x: number, y: number) => number = () => 0,
    ) {}

    public update(now: number): void {
        if (!this.isShown()) {
            if (this.shown.size > 0) {
                this.clear();
                this.scene.markDirty();
            }
            return;
        }
        if (this.life.isEmpty() && this.shown.size === 0) return;
        const seen = new Set<number>();
        const view = this.scene.cameras.main.worldView;
        const onScreen = (x: number, y: number): boolean =>
            x >= view.x - MARGIN_PX &&
            x <= view.x + view.width + MARGIN_PX &&
            y >= view.y - MARGIN_PX &&
            y <= view.y + view.height + MARGIN_PX;
        const reduced = this.reducedMotion();
        // The scene is drawn again only when something the player can see changed.
        let changed = false;
        for (const animal of this.life.shown(now, reduced)) {
            const species = landSpeciesOf(animal.kind);
            if (!species) continue;
            const led = this.lead(animal, now);
            // With its master, wherever they are.
            if (led === "hidden") continue;
            seen.add(animal.id);
            const x = Math.round(led?.x ?? animal.x);
            // On a bridge it is drawn as high as the deck, over its slabs: the life tells its place on the ground.
            const lift = led ? 0 : Math.round(this.liftAt(animal.x, animal.y));
            const placeY = Math.round(led?.y ?? animal.y);
            // On the ground it is drawn where the ground is: lower in a hollow, higher on a mount. Not on a deck.
            const drop = lift > 0 ? 0 : Math.round(led?.drop ?? this.dropAt(x, placeY));
            const y = placeY - lift + drop;
            const columns = this.columnsOf(species);
            const key = columns === undefined ? ensureLandTexture(this.scene, species) : this.sheetOf(species);
            if (key === undefined) continue;
            let entry = this.shown.get(animal.id);
            if (!entry) {
                const sprite = this.scene.add.sprite(x, y, key).setOrigin(0.5, 0.9);
                entry = {
                    sprite,
                    direction: animal.facingLeft ? "left" : "right",
                    columns,
                    species,
                    moving: false,
                    led: false,
                    atX: animal.x,
                    atY: animal.y,
                    drinkingSince: undefined,
                    drop,
                };
                this.shown.set(animal.id, entry);
                changed ||= onScreen(x, y);
            }
            const { sprite } = entry;
            if (entry.columns !== columns) {
                sprite.setTexture(key);
                entry.columns = columns;
                changed ||= onScreen(x, y);
            }
            const moved = Math.abs(x - sprite.x) >= 1 || Math.abs(y - sprite.y) >= 1;
            const moving = led ? led.moving : moved;
            entry.direction = led
                ? led.direction
                : directionOf(animal.x - entry.atX, animal.y - entry.atY, entry.direction);
            entry.atX = animal.x;
            entry.atY = animal.y;
            if (moved || sprite.alpha !== animal.alpha) changed ||= onScreen(x, y) || onScreen(sprite.x, sprite.y);
            entry.moving = moving;
            entry.led = led !== undefined;
            entry.drop = drop;
            sprite.setPosition(x, y);
            // Sorted by its place, whatever the row it is drawn at.
            placeAtDepth(sprite, lift > 0 ? floorDepth(lift, placeY) : placeY);
            sprite.setAlpha(animal.alpha);
            // Head down at the water (the stance of the wandering animals, without its sway of a pixel: the place
            // of the sprite tells whether the animal moved).
            // An antelope that stands still on grass grazes, in the same stance: the server eats the grass under it.
            const grazing = species === "antelope" && !moving && this.grassAt(animal.x, animal.y);
            const drinking = (animal.state === DRINKING || grazing) && led === undefined;
            entry.drinkingSince = drinking ? (entry.drinkingSince ?? now) : undefined;
            const stance =
                entry.drinkingSince === undefined
                    ? undefined
                    : drinkStance(entry.direction, now - entry.drinkingSince, reduced);
            const angle = stance?.angle ?? 0;
            const scaleY = stance?.scaleY ?? 1;
            if (sprite.angle !== angle || sprite.scaleY !== scaleY) {
                sprite.setAngle(angle);
                sprite.setScale(1, scaleY);
                changed ||= onScreen(x, y);
            }
            if (columns === undefined) {
                // The image drawn here heads right.
                sprite.setFlipX(entry.direction === "left" || (entry.direction !== "right" && animal.facingLeft));
            } else {
                sprite.setFlipX(false);
                const frame = landFrame(entry.direction, moving && !reduced, now, columns);
                if (sprite.frame.name !== String(frame) && sprite.frame.name !== (frame as unknown)) {
                    sprite.setFrame(frame);
                    changed ||= onScreen(x, y);
                }
            }
        }
        for (const [id, entry] of this.shown) {
            if (seen.has(id)) continue;
            changed ||= onScreen(entry.sprite.x, entry.sprite.y);
            entry.sprite.destroy();
            this.shown.delete(id);
        }
        if (changed) this.scene.markDirty();
    }

    /** The animals drawn now: for their shadows and their calls. */
    public forEachShown(
        callback: (
            id: number,
            sprite: Phaser.GameObjects.Sprite,
            animal: { species: LandSpecies; moving: boolean; led: boolean; drop: number },
        ) => void,
    ): void {
        for (const [id, { sprite, species, moving, led, drop }] of this.shown) {
            callback(id, sprite, { species, moving, led, drop });
        }
    }

    public destroy(): void {
        this.clear();
    }

    /** The columns of the sheet of a species once it is loaded and fits; it is asked for the first time it is needed. */
    private columnsOf(species: LandSpecies): number | undefined {
        const sheet = this.sheetOf(species);
        if (sheet === undefined) return undefined;
        if (!this.scene.textures.exists(sheet)) {
            if (!this.requested.has(sheet)) {
                this.requested.add(sheet);
                this.scene.load.spritesheet(sheet, sheet, {
                    frameWidth: WANDER_FRAME_SIZE,
                    frameHeight: WANDER_FRAME_SIZE,
                });
                this.scene.load.start();
            }
            return undefined;
        }
        const texture = this.scene.textures.get(sheet);
        const image = texture.getSourceImage();
        const columns = Math.floor(image.width / WANDER_FRAME_SIZE);
        // "__BASE" is not a frame of the sheet.
        const fits = columns >= WANDER_WALK_COLUMNS && texture.frameTotal - 1 >= SHEET_ROWS * columns;
        return fits ? columns : undefined;
    }

    private clear(): void {
        for (const entry of this.shown.values()) entry.sprite.destroy();
        this.shown.clear();
    }
}
