import * as Phaser from "phaser";
import type { Writable } from "svelte/store";
import { writable } from "svelte/store";
import type { CancelablePromise } from "cancelable-promise";
import { PositionMessage_Direction } from "@workadventure/messages";
import type { GameScene } from "../Game/GameScene";
import type { Character } from "../Entity/Character";
import { findSeatOfCharacter, getSeats, isSeatTaken } from "../Player/Seat";
import type { Seat } from "../Player/Seat";
import type { PictureStore } from "../../Stores/PictureStore";
import { TexturesHelper } from "../Helpers/TexturesHelper";
import { PlayerAnimationTypes } from "../Player/Animation";
import { ProtobufClientUtils } from "../../Network/ProtobufClientUtils";
import { debugRepo } from "../../Utils/Debuggers";
import { wanderIdleFrame } from "../Game/Wander/WanderSheet";
import type { WaterRectangle } from "../Game/Water/WaterZones";
import {
    BODY_CENTER_OFFSET_Y,
    getWaterRectangles,
    isPointInWater,
    segmentCrossesWater,
} from "../Game/Water/WaterZones";
import { companionColumns, companionStillFrame, companionWalkFrames } from "./CompanionSheet";

import Sprite = Phaser.GameObjects.Sprite;
import Container = Phaser.GameObjects.Container;
import Body = Phaser.Physics.Arcade.Body;

export interface CompanionStatus {
    x: number;
    y: number;
    name: string;
    moving: boolean;
    direction: PositionMessage_Direction;
}

// Minimal distance between two recorded points of the player's trail.
const TRAIL_SPACING = 6;
const MAX_TRAIL_LENGTH = 400;
// The companion stays idle when it is closer than this (path distance) to the player.
const FOLLOW_DISTANCE = 40;
// Delay (ms) without movement before the companion switches to its idle animation.
const IDLE_DELAY = 150;
// The walking axis (horizontal / vertical) only changes when the other one is this much larger.
const DIRECTION_HYSTERESIS = 1.5;
// The companion is drawn slightly below the player's position.
const COMPANION_Y_OFFSET = 4;
const TELEPORT_DISTANCE = 300;
const MAX_SPEED = 1500;
// Below this lag (px), the companion is considered to be at its spot.
const MIN_LAG_TO_WALK = 0.01;
// The trail records the player's position shifted by COMPANION_Y_OFFSET: its body center is this much lower.
const TRAIL_BODY_CENTER_OFFSET_Y = BODY_CENTER_OFFSET_Y - COMPANION_Y_OFFSET;
const REAPPEAR_DURATION = 300;

export class Companion extends Container {
    public sprites: Map<string, Sprite>;

    private lastMoveTime = 0;
    private exactX: number;
    private exactY: number;
    private trail: { x: number; y: number }[] = [];
    private water: WaterRectangle[] = [];
    private invisible: boolean;
    private updateListener: (time: number, delta: number) => void;
    private target: { x: number; y: number; direction: PositionMessage_Direction };

    private direction: PositionMessage_Direction;
    private animationType: PlayerAnimationTypes;
    private readonly _pictureStore: Writable<string | undefined>;
    private texturePromise: CancelablePromise<string | void> | undefined;
    // Number of columns of each sheet (see CompanionSheet): 5 when it has sitting and lying poses.
    private readonly columns = new Map<string, number>();

    constructor(
        scene: Phaser.Scene,
        private readonly owner: { x: number; y: number },
        texturePromise: CancelablePromise<string>,
    ) {
        super(scene, owner.x, owner.y + COMPANION_Y_OFFSET);

        this.sprites = new Map<string, Sprite>();

        this.exactX = owner.x;
        this.exactY = owner.y + COMPANION_Y_OFFSET;
        this.invisible = true;
        this.target = { x: owner.x, y: owner.y + COMPANION_Y_OFFSET, direction: PositionMessage_Direction.DOWN };

        this.direction = PositionMessage_Direction.DOWN;
        this.animationType = PlayerAnimationTypes.Idle;

        this._pictureStore = writable(undefined);

        this.texturePromise = texturePromise
            .then((resource) => {
                this.addResource(resource);
                this.invisible = false;
                return this.getSnapshot().then((htmlImageElementSrc) => {
                    this._pictureStore.set(htmlImageElementSrc);
                });
            })
            .catch((_) => debugRepo("No companion texture for this player"));

        this.scene.physics.world.enableBody(this);

        this.getBody().setImmovable(true);
        this.getBody().setCollideWorldBounds(false);
        this.setSize(16, 16);
        this.getBody().setSize(16, 16);
        this.getBody().setOffset(0, 8);

        this.setDepth(-1);

        // The companion arrives standing: it sits, then lies down, from now on.
        this.lastMoveTime = scene.time.now;

        this.updateListener = this.step.bind(this);
        // After the update of the player (which sets the target), so that the companion never is a frame behind it.
        this.scene.events.addListener("postupdate", this.updateListener);

        this.scene.add.existing(this);
    }

    public get lastDirection(): PositionMessage_Direction {
        return this.direction;
    }

    public setTarget(x: number, y: number, direction: PositionMessage_Direction) {
        const targetY = y + COMPANION_Y_OFFSET;
        this.target = { x, y: targetY, direction };

        const last = this.trail[this.trail.length - 1];
        const lastX = last?.x ?? this.exactX;
        const lastY = last?.y ?? this.exactY;
        const jump = Math.hypot(x - lastX, targetY - lastY);

        if (jump > TELEPORT_DISTANCE) {
            // The player teleported: do not walk through the map, jump with them.
            this.trail = [];
            this.placeAt(x, targetY);
            return;
        }

        if (jump >= TRAIL_SPACING) {
            this.trail.push({ x, y: targetY });
            if (this.trail.length > MAX_TRAIL_LENGTH) {
                this.trail.shift();
            }
        }
    }

    /**
     * The direction only changes when the other axis clearly dominates: on a zigzagging trail (keyboard
     * movement), flipping the direction on every frame would restart the animation continuously.
     */
    /**
     * The position is kept with its decimals, but the container is drawn on whole pixels: the sprite is blurry
     * otherwise (the player can have half pixels when running).
     */
    private placeAt(x: number, y: number): void {
        this.exactX = x;
        this.exactY = y;
        this.setPosition(Math.round(x), Math.round(y));
    }

    private updateDirection(dx: number, dy: number): void {
        const horizontal =
            this.direction === PositionMessage_Direction.LEFT || this.direction === PositionMessage_Direction.RIGHT;
        const ax = Math.abs(dx);
        const ay = Math.abs(dy);
        if (ax === 0 && ay === 0) {
            return;
        }
        // Keep the current axis unless the other one clearly dominates.
        const useHorizontal = horizontal ? !(ay > ax * DIRECTION_HYSTERESIS) : ax > ay * DIRECTION_HYSTERESIS;
        if (useHorizontal) {
            this.direction = dx < 0 ? PositionMessage_Direction.LEFT : PositionMessage_Direction.RIGHT;
        } else {
            this.direction = dy < 0 ? PositionMessage_Direction.UP : PositionMessage_Direction.DOWN;
        }
    }

    public step(time: number, delta: number) {
        if (typeof this.target === "undefined") return;

        // The owner is read directly: it is moved by the physics after the update of the scene, so the position
        // given by setTarget is one frame old.
        this.setTarget(this.owner.x, this.owner.y, this.target.direction);

        if (this.sitNextToOwner(time, delta)) {
            return;
        }

        const waitingAtTheEdge = this.keepOutOfWater();

        // Distance the companion still has to walk along the trail to be at FOLLOW_DISTANCE from the player.
        const lag = waitingAtTheEdge ? 0 : this.getRemainingPathLength() - FOLLOW_DISTANCE;

        if (lag > MIN_LAG_TO_WALK) {
            this.lastMoveTime = time;
            this.animationType = PlayerAnimationTypes.Walk;

            // The companion covers exactly what the player just walked, in the same frame: the distance between
            // them stays constant, whatever the irregularities of the player's steps. Only a big delay
            // (teleport, lag) is caught up progressively, capped by MAX_SPEED.
            let remaining = Math.min(lag, (MAX_SPEED * delta) / 1000);
            const startX = this.exactX;
            const startY = this.exactY;

            // Walk exactly along the player's trail, like the tail of a snake follows its head: the position is
            // moved along the recorded segments (never in a straight line to the player), so it cannot cut
            // through walls the player went around.
            while (remaining > 0) {
                const waypoint = this.trail[0] ?? this.target;
                if (this.isInWater(waypoint)) {
                    // Stop at the edge: the next frame decides whether to wait or to rejoin the player.
                    break;
                }
                const xDist = waypoint.x - this.exactX;
                const yDist = waypoint.y - this.exactY;
                const distance = Math.hypot(xDist, yDist);

                if (distance <= remaining) {
                    this.placeAt(waypoint.x, waypoint.y);
                    remaining -= distance;
                    if (this.trail.length === 0) {
                        break;
                    }
                    this.trail.shift();
                } else {
                    this.placeAt(
                        this.exactX + (xDist / distance) * remaining,
                        this.exactY + (yDist / distance) * remaining,
                    );
                    remaining = 0;
                }
            }

            this.updateDirection(this.exactX - startX, this.exactY - startY);
        } else if (time - this.lastMoveTime > IDLE_DELAY) {
            // Wait a little before stopping, so that a slow frame rate does not flicker walk / idle animations.
            this.animationType = PlayerAnimationTypes.Idle;
            this.direction = this.target.direction;
        }

        this.setDepth(this.exactY);
        this.playAnimation(this.direction, this.animationType, time);
    }

    /**
     * Companions never go into the water. While the trail leads into it, the companion waits at the edge. Once the
     * player is out, the wet part of the trail is dropped; when the way to the exit point crosses the water, the
     * companion reappears there instead of swimming. Returns true while waiting.
     */
    private keepOutOfWater(): boolean {
        this.water = getWaterRectangles(this.scene);
        if (this.water.length === 0) {
            return false;
        }
        const route = [...this.trail, this.target];
        if (!this.isInWater(route[0])) {
            return false;
        }
        const exitIndex = route.findIndex((point, index) => index > 0 && !this.isInWater(point));
        if (exitIndex === -1) {
            return true;
        }
        const exit = route[exitIndex];
        this.trail = this.trail.slice(exitIndex);
        if (
            segmentCrossesWater(
                this.water,
                { x: this.exactX, y: this.exactY + TRAIL_BODY_CENTER_OFFSET_Y },
                { x: exit.x, y: exit.y + TRAIL_BODY_CENTER_OFFSET_Y },
            )
        ) {
            this.placeAt(exit.x, exit.y);
            this.setAlpha(0);
            this.scene.tweens.add({ targets: this, alpha: 1, duration: REAPPEAR_DURATION });
        }
        return false;
    }

    /**
     * When its player sits on a couch with a free place, the companion takes the place next to it, drawn like a seated
     * player. Returns true while it goes there or sits there.
     */
    private sitNextToOwner(time: number, delta: number): boolean {
        const seat = this.findFreeSeatNextToOwner();
        if (!seat) return false;
        const spot = { x: seat.feet.x, y: seat.feet.y - TRAIL_BODY_CENTER_OFFSET_Y };
        const distance = Math.hypot(spot.x - this.exactX, spot.y - this.exactY);
        if (distance > MIN_LAG_TO_WALK) {
            const step = Math.min(distance, (MAX_SPEED * delta) / 1000 / 8);
            const startX = this.exactX;
            const startY = this.exactY;
            this.placeAt(
                this.exactX + ((spot.x - this.exactX) / distance) * step,
                this.exactY + ((spot.y - this.exactY) / distance) * step,
            );
            this.updateDirection(this.exactX - startX, this.exactY - startY);
            this.lastMoveTime = time;
            this.animationType = PlayerAnimationTypes.Walk;
        } else if (time - this.lastMoveTime > IDLE_DELAY) {
            this.animationType = PlayerAnimationTypes.Idle;
            this.direction = seat.direction;
        }
        // Back on the trail of its player once it stands up.
        this.trail = [];
        this.setDepth(seat.depth);
        this.playAnimation(this.direction, this.animationType, time);
        return true;
    }

    private findFreeSeatNextToOwner(): Seat | undefined {
        const owner = this.owner as Partial<Character> & { x: number; y: number };
        if (typeof owner.isSeated !== "function" || !owner.isSeated()) return undefined;
        const scene = this.scene as GameScene;
        const ownerSeat = findSeatOfCharacter(scene, owner as Character);
        if (!ownerSeat) return undefined;
        return getSeats(scene)
            .filter(
                (seat) => seat.entityId === ownerSeat.entityId && seat.id !== ownerSeat.id && !isSeatTaken(scene, seat),
            )
            .sort(
                (a, b) =>
                    Math.hypot(a.feet.x - ownerSeat.feet.x, a.feet.y - ownerSeat.feet.y) -
                    Math.hypot(b.feet.x - ownerSeat.feet.x, b.feet.y - ownerSeat.feet.y),
            )[0];
    }

    private isInWater(point: { x: number; y: number }): boolean {
        return isPointInWater(this.water, { x: point.x, y: point.y + TRAIL_BODY_CENTER_OFFSET_Y });
    }

    /**
     * Length of the path the companion has to walk to reach the player: through every waypoint of the trail.
     */
    private getRemainingPathLength(): number {
        let length = 0;
        let fromX = this.exactX;
        let fromY = this.exactY;
        for (const point of this.trail) {
            length += Math.hypot(point.x - fromX, point.y - fromY);
            fromX = point.x;
            fromY = point.y;
        }
        return length + Math.hypot(this.target.x - fromX, this.target.y - fromY);
    }

    public async getSnapshot(): Promise<string> {
        const sprites = Array.from(this.sprites.values()).map((sprite) => {
            return { sprite, frame: 1 };
        });
        return TexturesHelper.getSnapshot(this.scene, ...sprites).catch((reason) => {
            console.warn(reason);
            for (const sprite of this.sprites.values()) {
                // it can be either cat or dog prefix
                if (sprite.texture.key.includes("cat") || sprite.texture.key.includes("dog")) {
                    return this.scene.textures.getBase64(sprite.texture.key);
                }
            }
            return "cat1";
        });
    }

    private playAnimation(direction: PositionMessage_Direction, type: PlayerAnimationTypes, time: number): void {
        if (this.invisible) return;

        const directionStr = ProtobufClientUtils.toDirectionString(direction);
        for (const [resource, sprite] of this.sprites.entries()) {
            const columns = this.columns.get(resource) ?? 3;
            if (type === PlayerAnimationTypes.Idle && columns >= 5) {
                // Sitting as soon as the player stops, then lying: still frames, not animations.
                const frame = companionStillFrame(directionStr, time - this.lastMoveTime, columns);
                if (sprite.anims.isPlaying) {
                    sprite.stop();
                }
                // The frames of a sprite sheet are named by their index (a number at runtime).
                if (String(sprite.frame.name) !== String(frame)) {
                    sprite.setFrame(frame);
                }
                continue;
            }
            sprite.play(`${resource}-${directionStr}-${type}`, true);
        }
    }

    private addResource(resource: string, frame?: string | number): void {
        const sprite = new Sprite(this.scene, 0, 0, resource, frame);

        this.add(sprite);
        this.columns.set(resource, companionColumns(this.scene.textures.get(resource).getSourceImage().width));

        this.getAnimations(resource).forEach((animation) => {
            if (!animation.key || !this.scene.anims.exists(animation.key)) {
                this.scene.anims.create(animation);
            }
        });

        this.scene.sys.updateList.add(sprite);
        this.sprites.set(resource, sprite);
    }

    private getAnimations(resource: string): Phaser.Types.Animations.Animation[] {
        const columns = this.columns.get(resource) ?? 3;
        const directions = ["down", "left", "right", "up"] as const;
        return [
            ...directions.map((direction) => ({
                key: `${resource}-${direction}-${PlayerAnimationTypes.Idle}`,
                frames: this.scene.anims.generateFrameNumbers(resource, {
                    frames: [wanderIdleFrame(direction, columns)],
                }),
                frameRate: 10,
                repeat: 1,
            })),
            ...directions.map((direction) => ({
                key: `${resource}-${direction}-${PlayerAnimationTypes.Walk}`,
                frames: this.scene.anims.generateFrameNumbers(resource, {
                    frames: companionWalkFrames(direction, columns),
                }),
                frameRate: 15,
                repeat: -1,
            })),
        ];
    }

    private getBody(): Body {
        const body = this.body;

        if (!(body instanceof Body)) {
            throw new Error("Container does not have arcade body");
        }

        return body;
    }

    public destroy(): void {
        this.texturePromise?.cancel();
        for (const sprite of this.sprites.values()) {
            if (this.scene) {
                this.scene.sys.updateList.remove(sprite);
            }
        }

        if (this.scene) {
            this.scene.events.removeListener("postupdate", this.updateListener);
        }

        super.destroy();
    }

    public get pictureStore(): PictureStore {
        return this._pictureStore;
    }
}
