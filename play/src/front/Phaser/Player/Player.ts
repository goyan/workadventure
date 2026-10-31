import type { Unsubscriber } from "svelte/store";
import { get } from "svelte/store";
import type { CancelablePromise } from "cancelable-promise";
import { AskPositionMessage_AskType, PositionMessage_Direction } from "@workadventure/messages";
import type { GameScene } from "../Game/GameScene";
import type { ActiveEventList } from "../UserInput/UserInputManager";
import { UserInputEvent } from "../UserInput/UserInputManager";
import { Character } from "../Entity/Character";
import type { PathFollowResult } from "../Entity/Character";
import { PathTileType } from "../../Utils/PathfindingManager";
import { isWaypointBlocked } from "../../Utils/PathValidation";

import { userMovingStore } from "../../Stores/GameStore";
import { followStateStore, followRoleStore, followUsersStore } from "../../Stores/FollowStore";
import { ENABLE_TILE_SNAP, WOKA_SPEED } from "../../Enum/EnvironmentVariable";
import { visibilityStore } from "../../Stores/VisibilityStore";
import { passStatusToOnline } from "../../Rules/StatusRules/statusChangerFunctions";
import { localUserStore } from "../../Connection/LocalUserStore";
import { WalkDestinationMarker } from "../Components/WalkDestinationMarker";
import { RunSmokeTrail } from "../Components/RunSmokeTrail";
import { RUN_ANIMATION_SPEED } from "./Animation";
import { computeTileSnapTarget, getFeetTile } from "./TileSnap";
import type { Seat } from "./Seat";
import { findSeatUnderFeet, isSeatTaken } from "./Seat";

export const hasMovedEventName = "hasMoved";
export const startMovingEventName = "startMoving";
export const requestEmoteEventName = "requestEmote";

export class Player extends Character {
    private readonly unsubscribeVisibilityStore: Unsubscriber;
    private readonly destinationMarker: WalkDestinationMarker;
    private readonly runSmokeTrail: RunSmokeTrail;
    private isMoving = false;
    private isSlidingToSeat = false;
    // The keys held to walk onto the seat must be released before a key press makes the player stand up.
    private mustReleaseKeysBeforeStandingUp = false;
    // Seat the player just left (or stopped sliding to): it is not sat on again until the player leaves its tile.
    private ignoredSeatId: string | undefined;

    constructor(
        Scene: GameScene,
        x: number,
        y: number,
        name: string,
        texturesPromise: CancelablePromise<string[]>,
        direction: PositionMessage_Direction,
        moving: boolean,
        companionTexturePromise: CancelablePromise<string> | undefined,
    ) {
        super(Scene, x, y, texturesPromise, name, direction, moving, 1, true, companionTexturePromise, "me");
        //the current player model should be push away by other players to prevent conflict
        this.getBody().setImmovable(false);
        this.destinationMarker = new WalkDestinationMarker(Scene);
        this.runSmokeTrail = new RunSmokeTrail(Scene);

        this.unsubscribeVisibilityStore = visibilityStore.subscribe((isVisible) => {
            if (!isVisible) {
                this.stop();
                this.finishFollowingPath(true);
            }
        });
    }

    public moveUser(delta: number, activeUserInputEvents: ActiveEventList): void {
        const state = get(followStateStore);
        const role = get(followRoleStore);

        if (this.isSlidingToSeat) {
            // Keys held while walking onto the seat must not cancel the slide.
            this.followPath(delta);
            return;
        }
        if (this.isSeated()) {
            const hasMovementInput = this.hasMovementInput(activeUserInputEvents);
            if (!hasMovementInput) {
                this.mustReleaseKeysBeforeStandingUp = false;
            }
            if (!hasMovementInput || this.mustReleaseKeysBeforeStandingUp) {
                return;
            }
            this.standUp();
        } else if (!this.pathToFollow && state === "off") {
            this.trySitDown();
            if (this.isSlidingToSeat) {
                return;
            }
        }

        if (this.pathToFollow && activeUserInputEvents.anyExcept(UserInputEvent.SpeedUp)) {
            this.finishFollowingPath(true);
        }

        let x = 0;
        let y = 0;
        if ((state === "active" || state === "ending") && role === "follower") {
            [x, y] = this.computeFollowMovement();
        }
        if (this.pathToFollow) {
            this.followPath(delta);
        } else {
            this.inputStep(activeUserInputEvents, x, y);
        }
    }

    private hasMovementInput(activeUserInputEvents: ActiveEventList): boolean {
        return (
            activeUserInputEvents.get(UserInputEvent.MoveUp) ||
            activeUserInputEvents.get(UserInputEvent.MoveDown) ||
            activeUserInputEvents.get(UserInputEvent.MoveLeft) ||
            activeUserInputEvents.get(UserInputEvent.MoveRight)
        );
    }

    /**
     * Sits on the free seat under the feet of the player: slides to its center, then faces the way of the seat.
     */
    private trySitDown(): void {
        const body = this.getBody();
        const seat = findSeatUnderFeet(this.scene, { x: this.x, y: this.y + body.height / 2 + body.offset.y });
        if (seat?.id !== this.ignoredSeatId) {
            this.ignoredSeatId = undefined;
        }
        if (!seat || seat.id === this.ignoredSeatId || isSeatTaken(this.scene, seat)) {
            return;
        }
        this.slideToSeat(seat);
    }

    private slideToSeat(seat: Seat): void {
        this.isSlidingToSeat = true;
        this.stop();
        userMovingStore.set(false);
        this.setPathToFollow([seat.feet], WOKA_SPEED)
            .then((result) => {
                if (result.cancelled) {
                    this.ignoredSeatId = seat.id;
                    return;
                }
                this.ignoredSeatId = seat.id;
                this.sit(seat.direction);
                this.mustReleaseKeysBeforeStandingUp = true;
                this.emit(hasMovedEventName, { moving: false, direction: seat.direction, x: this.x, y: this.y });
            })
            .catch((e) => console.warn(e))
            .finally(() => {
                this.isSlidingToSeat = false;
            });
    }

    public rotate(): void {
        const direction = (this._lastDirection + 1) % (PositionMessage_Direction.LEFT + 1);
        this.emit(hasMovedEventName, {
            moving: false,
            running: false,
            direction: (this._lastDirection + 1) % (PositionMessage_Direction.LEFT + 1),
            x: this.x,
            y: this.y,
        });
        this._lastDirection = direction;
        this.companion?.setTarget(this.x, this.y, this._lastDirection);
        this.playAnimation(this._lastDirection, false);
    }

    public sendFollowRequest() {
        this.scene.connection?.emitFollowRequest();
        followRoleStore.set("leader");
        followStateStore.set("active");
    }

    public startFollowing() {
        followStateStore.set("active");
        this.scene.connection?.emitFollowConfirmation(get(followUsersStore)[0]);
    }

    public setPathToFollow(path: { x: number; y: number }[], speed?: number): Promise<PathFollowResult> {
        if (!this.isSlidingToSeat) {
            // Walking away (a click on the map, a script...) makes the player stand up.
            this.standUp();
        }
        if (!this.isMoving) {
            this.isMoving = true;
            this.emit(startMovingEventName, { direction: this._lastDirection, x: this.x, y: this.y });
        }

        this.getBody().setDirectControl(true);
        // Every walk ends here (taps, right-clicks, scripts, reroutes...): mark where it goes until it ends.
        const destination = path.at(-1);
        const walk = destination ? this.destinationMarker.show(destination) : undefined;
        return super.setPathToFollow(path, speed).finally(() => {
            this.isMoving = false;
            if (walk !== undefined) this.destinationMarker.hide(walk);
        });
    }

    /** Whether the avatar is walking a computed path, which moves it directly instead of by its velocity. */
    public isWalkingPath(): boolean {
        return this.pathToFollow !== undefined;
    }

    /** The waypoints still ahead on the current walk, the last one being the destination (empty when not walking). */
    public getPathAhead(): { x: number; y: number }[] {
        // The first waypoint is where the current segment started, behind the avatar.
        return this.pathToFollow?.slice(1) ?? [];
    }

    private deduceSpeed(speedUp: boolean, followMode: boolean): number {
        return this.pathWalkingSpeed ? this.pathWalkingSpeed : speedUp && !followMode ? 2.5 * WOKA_SPEED : WOKA_SPEED;
    }

    private inputStep(activeEvents: ActiveEventList, x: number, y: number) {
        // Process input events
        if (activeEvents.get(UserInputEvent.MoveUp)) {
            y = y - 1;
        } else if (activeEvents.get(UserInputEvent.MoveDown)) {
            y = y + 1;
        }

        if (activeEvents.get(UserInputEvent.MoveLeft)) {
            x = x - 1;
        } else if (activeEvents.get(UserInputEvent.MoveRight)) {
            x = x + 1;
        }

        // Normalize so that diagonal movement is not faster (length sqrt(2)) than straight movement
        const length = Math.hypot(x, y);
        if (length > 1) {
            x = x / length;
            y = y / length;
        }

        // Compute movement deltas
        const followMode = get(followStateStore) !== "off";
        const speedUp = activeEvents.get(UserInputEvent.SpeedUp);
        const speed = this.deduceSpeed(speedUp, followMode);
        const moveAmount = speed * 20;
        x = x * moveAmount;
        y = y * moveAmount;

        // Compute moving state
        const moving = x !== 0 || y !== 0;

        // Compute direction
        let direction = this._lastDirection;
        if (moving) {
            if (Math.abs(x) > Math.abs(y)) {
                direction = x < 0 ? PositionMessage_Direction.LEFT : PositionMessage_Direction.RIGHT;
            } else {
                direction = y < 0 ? PositionMessage_Direction.UP : PositionMessage_Direction.DOWN;
            }
        }

        // Send movement events
        const running = moving && speedUp && !followMode;
        const emit = () => this.emit(hasMovedEventName, { moving, running, direction, x: this.x, y: this.y });
        if (moving) {
            if (!this.isMoving) {
                this.isMoving = true;
                this.emit(startMovingEventName, { direction, x: this.x, y: this.y });
            }
            this.moveBy(x, y, running);
            if (running) {
                const body = this.getBody();
                this.runSmokeTrail.emit(this.x, this.y + body.offset.y + body.height / 2, x, y, this.depth - 1);
            }
            emit();
        } else if (get(userMovingStore)) {
            if (this.isMoving) {
                this.isMoving = false;
            }
            this.stop();
            emit();
            this.snapToTileCenter();
        }

        // Update state
        userMovingStore.set(moving);
    }

    /**
     * Slides the avatar to the center of the tile under its feet once it stops.
     * Any new movement key cancels the slide (see moveUser).
     */
    private snapToTileCenter(): void {
        if (!ENABLE_TILE_SNAP || get(followStateStore) !== "off" || this.isFollowingPath()) {
            return;
        }
        const gameMapFrontWrapper = this.scene.getGameMapFrontWrapper();
        const { width, height } = gameMapFrontWrapper.getTileDimensions();
        const body = this.getBody();
        const geometry = {
            tileWidth: width,
            tileHeight: height,
            bodyHeight: body.height,
            bodyOffsetY: body.offset.y,
        };
        const target = computeTileSnapTarget(this.x, this.y, geometry);
        if (!target) {
            return;
        }

        const { tileX, tileY } = getFeetTile(this.x, this.y, geometry);
        const collisionGrid = gameMapFrontWrapper.getCollisionGrid({ emitMapChangedEvent: false });
        if (collisionGrid[tileY]?.[tileX] !== 0) {
            return;
        }
        const path = [target];
        if (!gameMapFrontWrapper.isTileCollisionPathClear(this, path)) {
            return;
        }
        this.setPathToFollow(path, WOKA_SPEED).catch((e) => console.warn(e));
    }

    private computeFollowMovement(): number[] {
        // Find followed WOKA and abort following if we lost it
        const player = this.scene.MapPlayersByKey.get(get(followUsersStore)[0]);
        if (!player) {
            this.scene.connection?.emitFollowAbort();
            followStateStore.set("off");
            return [0, 0];
        }

        // Compute movement direction
        const xDistance = player.x - this.x;
        const yDistance = player.y - this.y;
        const distance = Math.pow(xDistance, 2) + Math.pow(yDistance, 2);
        if (distance < 2000) {
            return [0, 0];
        }
        return this.getMovementDirection(xDistance, yDistance, distance);
    }

    private getMovementDirection(xDistance: number, yDistance: number, distance: number): [number, number] {
        return [xDistance / Math.sqrt(distance), yDistance / Math.sqrt(distance)];
    }

    /**
     * Moves the character by the given speed amount.
     */
    private moveBy(x: number, y: number, running = false) {
        const body = this.getBody();

        body.setVelocity(x, y);

        if (Math.abs(body.velocity.x) > Math.abs(body.velocity.y)) {
            if (body.velocity.x < 0) {
                this._lastDirection = PositionMessage_Direction.LEFT;
            } else if (body.velocity.x > 0) {
                this._lastDirection = PositionMessage_Direction.RIGHT;
            }
        } else {
            if (body.velocity.y < 0) {
                this._lastDirection = PositionMessage_Direction.UP;
            } else if (body.velocity.y > 0) {
                this._lastDirection = PositionMessage_Direction.DOWN;
            }
        }
        passStatusToOnline();
        this.playAnimation(this._lastDirection, true, running ? RUN_ANIMATION_SPEED : 1);

        if (this.companion) {
            this.companion.setTarget(this.x, this.y, this._lastDirection);
        }
    }

    protected onPathFinished(wasFollowing: boolean): void {
        this.getBody().setDirectControl(false);
        if (wasFollowing) {
            this.emit(hasMovedEventName, {
                moving: false,
                running: false,
                direction: this._lastDirection,
                x: this.x,
                y: this.y,
            });
        }
    }

    protected followPath(delta: number): void {
        super.followPath(delta);
        this.emit(hasMovedEventName, {
            moving: true,
            running: false,
            direction: this._lastDirection,
            x: this.x,
            y: this.y,
        });
    }

    protected moveToPathPosition(x: number, y: number): void {
        passStatusToOnline();
        super.moveToPathPosition(x, y);
    }

    public finishFollowingPath(cancelled = false, blocked = false): void {
        const wasFollowing = this.isFollowingPath();
        super.finishFollowingPath(cancelled, blocked);
        this.onPathFinished(wasFollowing);
    }

    /**
     * The collision grid can change while a path is being followed (an area gets locked or full, an
     * entity is dropped...). Since the path following runs with direct body control, colliders would
     * not stop us: check the next waypoint on each tile change and abort right before walking onto a
     * tile that started colliding. Only the NEXT waypoint is checked, on purpose: the woka keeps
     * walking up to the obstacle, so the blocked warning shows next to the area it talks about, and a
     * lock lifted before the woka reaches the area never interrupts the walk. GameScene.moveTo() then
     * reroutes to the destination, or stops there when it is not reachable anymore.
     */
    protected onPathWaypointReached(): void {
        if (!this.pathToFollow || this.pathToFollow.length < 2) {
            return;
        }
        const gameMapFrontWrapper = this.scene.getGameMapFrontWrapper();
        const body = this.getBody();
        if (
            isWaypointBlocked(
                this.pathToFollow[1],
                gameMapFrontWrapper.getCollisionGrid({ emitMapChangedEvent: false }),
                gameMapFrontWrapper.getTileDimensions(),
                body.height / 2 + body.offset.y,
                PathTileType.Collider,
            )
        ) {
            this.finishFollowingPath(true, true);
        }
    }

    public teleportTo(x: number, y: number): void {
        this.standUp();
        this.setPosition(x, y);
        this.finishFollowingPath(true);
        this.emit(hasMovedEventName, {
            moving: false,
            running: false,
            direction: this._lastDirection,
            x: this.x,
            y: this.y,
        });
        this.scene.markDirty();
    }

    public get walkingSpeed(): number | undefined {
        return this.pathWalkingSpeed;
    }

    public emitAskPosition(): void {
        this.scene.connection?.emitAskPosition(
            localUserStore.getLocalUser()?.uuid ?? "",
            this.scene.roomUrl,
            AskPositionMessage_AskType.LOCATE,
        );
    }

    destroy(): void {
        this.unsubscribeVisibilityStore();
        this.destinationMarker.destroy();
        super.destroy();
    }
}
