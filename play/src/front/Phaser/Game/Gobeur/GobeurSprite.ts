import * as Phaser from "phaser";
import type { Entity } from "../../ECS/Entity";
import type { GameScene } from "../GameScene";
import type { Point } from "./GobeurSafety";
import { GOBEUR_POS_INTERVAL_MS } from "./GobeurProtocol";
import type { GobeurDirection } from "./GobeurProtocol";
import { gobeurSheetLayout, gobeurWalkFrames, sliceGridSheet } from "./GobeurSheet";

const FRAME = 32;
const ROWS = 4;
const WALK_FRAME_RATE = 8;
const DIRECTIONS: GobeurDirection[] = ["down", "left", "right", "up"];
// Farther than that between two positions (a first position, a lost frame burst): jump instead of sliding.
const SNAP_DISTANCE_PX = 5 * FRAME;
// Still moving if it moved that recently: the jitter of the positions does not stop and restart the walk.
const MOVING_GRACE_MS = 250;

export interface GobeurSheet {
    key: string;
    columns: number;
}

/**
 * Loads the walk sheets of the Gobeurs, once per sheet. The image is loaded under a key of its own (the wandering
 * characters load the same file as a 32 px sprite sheet), then turned into a texture of 32 px frames: a 4 x 4 grid of
 * any size is sliced by sliceGridSheet first.
 */
export class GobeurSheetLoader {
    private readonly sheets = new Map<string, Promise<GobeurSheet | undefined>>();
    private readonly cleanups = new Set<() => void>();
    private destroyed = false;

    constructor(private readonly scene: Phaser.Scene) {}

    public load(sheetPath: string): Promise<GobeurSheet | undefined> {
        let sheet = this.sheets.get(sheetPath);
        if (!sheet) {
            sheet = this.loadImage(`gobeur-source:${sheetPath}`, sheetPath).then((loaded) =>
                loaded && !this.destroyed
                    ? this.buildSheet(`gobeur:${sheetPath}`, `gobeur-source:${sheetPath}`)
                    : undefined,
            );
            this.sheets.set(sheetPath, sheet);
        }
        return sheet;
    }

    public destroy(): void {
        this.destroyed = true;
        for (const cleanup of this.cleanups) {
            cleanup();
        }
        this.cleanups.clear();
    }

    private loadImage(key: string, url: string): Promise<boolean> {
        if (this.scene.textures.exists(key)) {
            return Promise.resolve(true);
        }
        return new Promise((resolve) => {
            const event = `filecomplete-image-${key}`;
            const onComplete = (): void => {
                cleanup();
                resolve(true);
            };
            const onError = (file: Phaser.Loader.File): void => {
                if (file.key !== key) {
                    return;
                }
                cleanup();
                console.error(`Cannot load the Gobeur sheet "${url}"`);
                resolve(false);
            };
            const cleanup = (): void => {
                this.scene.load.off(event, onComplete);
                this.scene.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
                this.cleanups.delete(cleanup);
            };
            this.cleanups.add(() => {
                cleanup();
                resolve(false);
            });
            this.scene.load.once(event, onComplete);
            this.scene.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
            this.scene.load.image(key, url);
            this.scene.load.start();
        });
    }

    private buildSheet(key: string, sourceKey: string): GobeurSheet | undefined {
        if (this.scene.textures.exists(key)) {
            return { key, columns: Math.floor(this.scene.textures.get(key).getSourceImage().width / FRAME) };
        }
        const source = this.scene.textures.get(sourceKey).getSourceImage();
        if (!(source instanceof HTMLImageElement) && !(source instanceof HTMLCanvasElement)) {
            return undefined;
        }
        const layout = gobeurSheetLayout(source.width, source.height);
        const canvas = document.createElement("canvas");
        canvas.width = source.width;
        canvas.height = source.height;
        const context = canvas.getContext("2d");
        if (!context) {
            return undefined;
        }
        context.drawImage(source, 0, 0);
        let sheetCanvas = canvas;
        if (layout.mode === "grid") {
            const sliced = sliceGridSheet({
                width: canvas.width,
                height: canvas.height,
                data: context.getImageData(0, 0, canvas.width, canvas.height).data,
            });
            sheetCanvas = document.createElement("canvas");
            sheetCanvas.width = sliced.width;
            sheetCanvas.height = sliced.height;
            const slicedContext = sheetCanvas.getContext("2d");
            if (!slicedContext) {
                return undefined;
            }
            const imageData = slicedContext.createImageData(sliced.width, sliced.height);
            imageData.data.set(sliced.data);
            slicedContext.putImageData(imageData, 0, 0);
        }
        const columns = layout.columns;
        const texture = this.scene.textures.addCanvas(key, sheetCanvas);
        if (!texture || columns <= 0) {
            return undefined;
        }
        for (let i = 0; i < columns * ROWS; i++) {
            texture.add(i, 0, (i % columns) * FRAME, Math.floor(i / columns) * FRAME, FRAME, FRAME);
        }
        for (const direction of DIRECTIONS) {
            const animationKey = `${key}:${direction}`;
            if (!this.scene.anims.exists(animationKey)) {
                this.scene.anims.create({
                    key: animationKey,
                    frames: this.scene.anims.generateFrameNumbers(key, {
                        frames: gobeurWalkFrames(direction, columns),
                    }),
                    frameRate: WALK_FRAME_RATE,
                    repeat: -1,
                });
            }
        }
        return { key, columns };
    }
}

/**
 * The Gobeur on screen. The master sets its position every frame (setPose); the other browsers slide it towards the
 * last received position (setTarget). Its position is the position of its feet, like the wandering characters.
 * Until the sheet is loaded (or without a sheet) it shows the image of the entity, still, centred on that position:
 * at the start (the centre of the entity, see GobeurManager.startOf) it is drawn exactly over the entity.
 */
export class GobeurSprite {
    private readonly sprite: Phaser.GameObjects.Sprite;
    private sheet: GobeurSheet | undefined;
    private destroyed = false;
    private from: Point;
    private to: Point;
    private targetAt = 0;
    private direction: GobeurDirection = "down";
    private lastMovedAt = Number.NEGATIVE_INFINITY;

    constructor(
        private readonly scene: GameScene,
        entity: Entity,
        start: Point,
        sheetLoader: GobeurSheetLoader,
    ) {
        this.from = { ...start };
        this.to = { ...start };
        this.sprite = scene.add
            .sprite(start.x, start.y, entity.texture.key, entity.frame.name)
            .setOrigin(0.5, 0.5)
            .setScale(entity.scaleX, entity.scaleY)
            // Like the characters, the depth follows the y coordinate of the feet.
            .setDepth(start.y);
        const sheetPath = entity.getPrefab().wander?.sheetPath;
        if (sheetPath !== undefined) {
            sheetLoader
                .load(sheetPath)
                .then((sheet) => {
                    if (sheet && !this.destroyed) {
                        this.sheet = sheet;
                        // A walking character: 32 px frames standing on their feet.
                        this.sprite.setTexture(sheet.key, this.stillFrame()).setOrigin(0.5, 1).setScale(1);
                        this.scene.markDirty();
                    }
                })
                .catch((e) => console.error("Gobeur sheet", e));
        }
    }

    public get position(): Point {
        return { x: this.sprite.x, y: this.sprite.y };
    }

    /** Master: the position computed by the brain, shown as it is. */
    public setPose(x: number, y: number, direction: GobeurDirection, now: number): void {
        this.direction = direction;
        this.from = { x, y };
        this.to = { x, y };
        this.place(x, y, now);
    }

    /** Followers: slide to that position over the interval between two positions. */
    public setTarget(x: number, y: number, direction: GobeurDirection, now: number): void {
        this.direction = direction;
        const current = this.position;
        this.from = Math.hypot(x - current.x, y - current.y) > SNAP_DISTANCE_PX ? { x, y } : current;
        this.to = { x, y };
        this.targetAt = now;
    }

    /** Followers: called every frame. */
    public interpolate(now: number): void {
        const k = Math.min(1, Math.max(0, (now - this.targetAt) / GOBEUR_POS_INTERVAL_MS));
        const x = this.from.x + (this.to.x - this.from.x) * k;
        const y = this.from.y + (this.to.y - this.from.y) * k;
        this.place(x, y, now);
    }

    public destroy(): void {
        this.destroyed = true;
        this.sprite.destroy();
        this.scene.markDirty();
    }

    private place(x: number, y: number, now: number): void {
        if (x !== this.sprite.x || y !== this.sprite.y) {
            this.sprite.setPosition(x, y);
            this.lastMovedAt = now;
            this.scene.markDirty();
        }
        // Only on change: setting the depth sorts the display list again.
        if (this.sprite.depth !== y) {
            this.sprite.setDepth(y);
        }
        if (!this.sheet) {
            return;
        }
        if (now - this.lastMovedAt < MOVING_GRACE_MS) {
            this.sprite.play(`${this.sheet.key}:${this.direction}`, true);
            // The animation changes the frame on its own: the scene must be drawn.
            this.scene.markDirty();
        } else if (this.sprite.anims.isPlaying || String(this.sprite.frame.name) !== String(this.stillFrame())) {
            this.sprite.stop();
            this.sprite.setFrame(this.stillFrame());
            this.scene.markDirty();
        }
    }

    private stillFrame(): number {
        return gobeurWalkFrames(this.direction, this.sheet?.columns ?? 1)[0];
    }
}
