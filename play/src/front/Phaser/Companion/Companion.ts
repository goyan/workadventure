import * as Phaser from "phaser";
import type { Writable } from "svelte/store";
import { writable } from "svelte/store";
import type { CancelablePromise } from "cancelable-promise";
import { PositionMessage_Direction } from "@workadventure/messages";
import type { PictureStore } from "../../Stores/PictureStore";
import { TexturesHelper } from "../Helpers/TexturesHelper";
import { PlayerAnimationTypes } from "../Player/Animation";
import { ProtobufClientUtils } from "../../Network/ProtobufClientUtils";
import { debugRepo } from "../../Utils/Debuggers";

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
const FOLLOW_DISTANCE = 56;
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

export class Companion extends Container {
    public sprites: Map<string, Sprite>;

    private lastMoveTime = 0;
    private exactX: number;
    private exactY: number;
    private trail: { x: number; y: number }[] = [];
    private invisible: boolean;
    private updateListener: (time: number, delta: number) => void;
    private target: { x: number; y: number; direction: PositionMessage_Direction };

    private direction: PositionMessage_Direction;
    private animationType: PlayerAnimationTypes;
    private readonly _pictureStore: Writable<string | undefined>;
    private texturePromise: CancelablePromise<string | void> | undefined;

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

        this.updateListener = this.step.bind(this);
        // After the update of the player (which sets the target), so that the companion never is a frame behind it.
        this.scene.events.addListener("postupdate", this.updateListener);

        this.scene.add.existing(this);
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

        // Distance the companion still has to walk along the trail to be at FOLLOW_DISTANCE from the player.
        const lag = this.getRemainingPathLength() - FOLLOW_DISTANCE;

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
        this.playAnimation(this.direction, this.animationType);
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

    private playAnimation(direction: PositionMessage_Direction, type: PlayerAnimationTypes): void {
        if (this.invisible) return;

        const directionStr = ProtobufClientUtils.toDirectionString(direction);
        for (const [resource, sprite] of this.sprites.entries()) {
            sprite.play(`${resource}-${directionStr}-${type}`, true);
        }
    }

    private addResource(resource: string, frame?: string | number): void {
        const sprite = new Sprite(this.scene, 0, 0, resource, frame);

        this.add(sprite);

        this.getAnimations(resource).forEach((animation) => {
            if (!animation.key || !this.scene.anims.exists(animation.key)) {
                this.scene.anims.create(animation);
            }
        });

        this.scene.sys.updateList.add(sprite);
        this.sprites.set(resource, sprite);
    }

    private getAnimations(resource: string): Phaser.Types.Animations.Animation[] {
        return [
            {
                key: `${resource}-down-${PlayerAnimationTypes.Idle}`,
                frames: this.scene.anims.generateFrameNumbers(resource, { frames: [1] }),
                frameRate: 10,
                repeat: 1,
            },
            {
                key: `${resource}-left-${PlayerAnimationTypes.Idle}`,
                frames: this.scene.anims.generateFrameNumbers(resource, { frames: [4] }),
                frameRate: 10,
                repeat: 1,
            },
            {
                key: `${resource}-right-${PlayerAnimationTypes.Idle}`,
                frames: this.scene.anims.generateFrameNumbers(resource, { frames: [7] }),
                frameRate: 10,
                repeat: 1,
            },
            {
                key: `${resource}-up-${PlayerAnimationTypes.Idle}`,
                frames: this.scene.anims.generateFrameNumbers(resource, { frames: [10] }),
                frameRate: 10,
                repeat: 1,
            },
            {
                key: `${resource}-down-${PlayerAnimationTypes.Walk}`,
                frames: this.scene.anims.generateFrameNumbers(resource, { frames: [0, 1, 2] }),
                frameRate: 15,
                repeat: -1,
            },
            {
                key: `${resource}-left-${PlayerAnimationTypes.Walk}`,
                frames: this.scene.anims.generateFrameNumbers(resource, { frames: [3, 4, 5] }),
                frameRate: 15,
                repeat: -1,
            },
            {
                key: `${resource}-right-${PlayerAnimationTypes.Walk}`,
                frames: this.scene.anims.generateFrameNumbers(resource, { frames: [6, 7, 8] }),
                frameRate: 15,
                repeat: -1,
            },
            {
                key: `${resource}-up-${PlayerAnimationTypes.Walk}`,
                frames: this.scene.anims.generateFrameNumbers(resource, { frames: [9, 10, 11] }),
                frameRate: 15,
                repeat: -1,
            },
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
