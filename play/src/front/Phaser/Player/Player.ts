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
import { findDiveTarget, getWaterRectangles, intersectsWater } from "../Game/Water/WaterZones";
import { InteractionPrompt } from "../Game/Water/InteractionPrompt";
import { getPrefabCollisionRectangles } from "../../Utils/PrefabCollisionRectangles";
import LL from "../../../i18n/i18n-svelte";
import { AvatarAction, AVATAR_ACTION_VARIABLE, readAvatarAction } from "../Entity/AvatarAction";
import { readSwimwear, SWIMWEAR_VARIABLE } from "../Entity/Swimwear";
import { RUN_ANIMATION_SPEED } from "./Animation";
import { computeTileSnapTarget, getFeetTile } from "./TileSnap";
import type { Seat } from "./Seat";
import { findSeatUnderFeet, isSeatTaken } from "./Seat";
import { findActionableObject } from "./ActionableObjects";

/** Water set to dive on contact: the body center this close to it makes the player dive. */
const AUTO_DIVE_DISTANCE = 10;
/** How deep a body must be in the water to swim without diving (Arcade's overlap bias). */
const EMBEDDED_MARGIN = 4;
/** Swimming is slower than walking. */
const SWIM_SPEED_FACTOR = 0.6;

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
    private seatEntityId: string | undefined;
    private ignoredSeatEntityId: string | undefined;
    private swimming = false;
    private diveTarget: ReturnType<typeof findDiveTarget>;
    private readonly divePrompt: InteractionPrompt;
    private readonly sitPrompt: InteractionPrompt;
    private readonly actionPrompt: InteractionPrompt;
    private actionObject: ReturnType<typeof findActionableObject>;
    private ignoredActionObjectId: string | undefined;

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
        this.divePrompt = new InteractionPrompt(Scene, "water-dive", () => get(LL).trigger.swim());
        this.sitPrompt = new InteractionPrompt(Scene, "seat-sit", () => get(LL).trigger.sit());
        this.actionPrompt = new InteractionPrompt(Scene, "avatar-object-action", () =>
            get(LL).trigger.avatarAction({
                action: get(LL).woka.actions[this.actionObject?.action ?? AvatarAction.Idle](),
            }),
        );

        this.unsubscribeVisibilityStore = visibilityStore.subscribe((isVisible) => {
            if (!isVisible) {
                this.stop();
                this.finishFollowingPath(true);
            }
        });
    }

    public moveUser(delta: number, activeUserInputEvents: ActiveEventList): void {
        this.updateSwimming();
        this.updateObjectAction();
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

    public override setAvatarAction(value: unknown): void {
        const action = readAvatarAction(value);
        if (action === this.action) return;
        if (action !== AvatarAction.Idle) {
            if (this.isInWater() || this.isSlidingToSeat || get(followStateStore) !== "off") return;
            this.finishFollowingPath(true);
            this.stop();
            userMovingStore.set(false);
            this.emit(hasMovedEventName, {
                moving: false,
                running: false,
                direction: this.lastDirection,
                x: this.x,
                y: this.y,
            });
        }
        super.setAvatarAction(action);
        this.scene.getPlayerVariablesManager()?.setVariableFromApp(AVATAR_ACTION_VARIABLE, action, {
            public: true,
            persist: false,
            scope: "room",
        });
    }

    public override setSwimwear(value: unknown): void {
        const style = readSwimwear(value);
        super.setSwimwear(style);
        localUserStore.setSwimwear(style);
        this.scene.getPlayerVariablesManager()?.setVariableFromApp(SWIMWEAR_VARIABLE, style, { public: true });
    }

    private updateObjectAction(): void {
        const body = this.getBody();
        const object = findActionableObject(this.scene, { x: this.x, y: this.y + body.offset.y + body.height / 2 });
        if (object?.entityId !== this.ignoredActionObjectId) this.ignoredActionObjectId = undefined;
        if (object?.entityId !== this.actionObject?.entityId || object?.action !== this.actionObject?.action)
            this.actionPrompt.hide();
        this.actionObject = object;
        if (
            this.action !== AvatarAction.Idle ||
            this.isInWater() ||
            !object ||
            object.entityId === this.ignoredActionObjectId
        ) {
            this.actionPrompt.hide();
            return;
        }
        const activate = (): void => {
            this.actionPrompt.hide();
            this.ignoredActionObjectId = object.entityId;
            if (object.action === AvatarAction.Sleep || object.action === AvatarAction.Toilet) {
                this.seatEntityId = object.entityId;
                this.isSlidingToSeat = true;
                this.stop();
                userMovingStore.set(false);
                this.setPathToFollow([object.feet], WOKA_SPEED)
                    .then((result) => {
                        this.isSlidingToSeat = false;
                        if (result.cancelled) return;
                        this._lastDirection = object.direction;
                        this.setAvatarAction(object.action);
                    })
                    .catch((error) => console.error("Could not approach avatar action object", error))
                    .finally(() => {
                        this.isSlidingToSeat = false;
                    });
            } else this.setAvatarAction(object.action);
        };
        if (object.trigger === "auto") activate();
        else this.actionPrompt.show(activate);
    }

    /**
     * Sits on the free seat under the feet of the player: slides to its center, then faces the way of the seat.
     */
    private trySitDown(): void {
        const body = this.getBody();
        this.releaseSeatObjectWhenOut();
        const seat = findSeatUnderFeet(
            this.scene,
            { x: this.x, y: this.y + body.height / 2 + body.offset.y },
            { x: body.x, y: body.y, width: body.width, height: body.height },
        );
        if (seat?.id !== this.ignoredSeatId) {
            this.ignoredSeatId = undefined;
        }
        // The other places of the couch just left are ignored too, until the player walks away from it.
        if (seat?.entityId !== this.ignoredSeatEntityId) {
            this.ignoredSeatEntityId = undefined;
        }
        if (
            !seat ||
            seat.id === this.ignoredSeatId ||
            seat.entityId === this.ignoredSeatEntityId ||
            isSeatTaken(this.scene, seat)
        ) {
            this.sitPrompt.hide();
            return;
        }
        if (seat.trigger === "key") {
            // A seat set to the interaction key: offer it, sit only when asked.
            this.sitPrompt.show(() => {
                this.sitPrompt.hide();
                this.slideToSeat(seat);
            });
            return;
        }
        this.slideToSeat(seat);
    }

    /**
     * Whether the hitbox of this object must let the player through: it sits on it, slides to it, or just stood up
     * and has not walked out of it yet (otherwise the hitbox would throw it out).
     */
    public isSittingOn(entityId: string): boolean {
        return this.seatEntityId === entityId;
    }

    /** Once standing and out of the hitbox of the object it sat on, the object blocks the player again. */
    private releaseSeatObjectWhenOut(): void {
        if (this.seatEntityId === undefined || this.isSeated() || this.isSlidingToSeat) return;
        const entity = this.scene.getGameMapFrontWrapper().getEntitiesManager().getEntities().get(this.seatEntityId);
        const body = this.getBody();
        const stillInside = getPrefabCollisionRectangles(
            { x: entity?.x ?? 0, y: entity?.y ?? 0 },
            entity?.getPrefab().collisionRectangles,
        ).some(
            (r) =>
                body.x < r.x + r.width &&
                r.x < body.x + body.width &&
                body.y < r.y + r.height &&
                r.y < body.y + body.height,
        );
        if (!stillInside) this.seatEntityId = undefined;
    }

    private slideToSeat(seat: Seat): void {
        this.isSlidingToSeat = true;
        this.seatEntityId = seat.entityId;
        this.stop();
        userMovingStore.set(false);
        this.setPathToFollow([seat.feet], WOKA_SPEED)
            .then((result) => {
                if (result.cancelled) {
                    this.ignoredSeatId = seat.id;
                    this.ignoredSeatEntityId = seat.entityId;
                    return;
                }
                this.ignoredSeatId = seat.id;
                this.ignoredSeatEntityId = seat.entityId;
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

    private deduceSpeed(speedUp: boolean, followMode: boolean): number {
        const speed = this.pathWalkingSpeed
            ? this.pathWalkingSpeed
            : speedUp && !followMode
              ? 2.5 * WOKA_SPEED
              : WOKA_SPEED;
        return this.swimming ? speed * SWIM_SPEED_FACTOR : speed;
    }

    /** The local player knows it swims: near an edge its body center may be out of the water while it still swims. */
    protected override isSwimmingHere(): boolean {
        return this.swimming || super.isSwimmingHere();
    }

    /** Whether the player dove in and is still in the water: the water does not block it then. */
    public isSwimming(): boolean {
        return this.swimming;
    }

    /**
     * Out of the water, offers to dive when the player stands at its edge. In the water, the player gets out by
     * walking onto the edge: it stops swimming once no part of its body touches the water any more.
     */
    private updateSwimming(): void {
        const water = getWaterRectangles(this.scene);
        const body = this.getBody();
        const inWater = intersectsWater(water, { x: body.x, y: body.y, width: body.width, height: body.height });
        if (this.swimming) {
            if (!inWater) {
                this.swimming = false;
            }
            return;
        }
        // Deeper than the 4 px the collision lets a body overlap at an edge: touching the water is not being in it.
        const embedded = intersectsWater(water, {
            x: body.x + EMBEDDED_MARGIN,
            y: body.y + EMBEDDED_MARGIN,
            width: body.width - 2 * EMBEDDED_MARGIN,
            height: body.height - 2 * EMBEDDED_MARGIN,
        });
        if (embedded && !this.isSeated() && !this.isSlidingToSeat) {
            // The body got into the water without diving (a pool placed or moved onto the player, a teleport...): the
            // collision cannot push a body out of a rectangle it is already in, so it swims until it gets out.
            this.divePrompt.hide();
            this.swimming = true;
            return;
        }
        this.diveTarget =
            water.length > 0 && !this.isSeated() && !this.isSlidingToSeat
                ? findDiveTarget(water, { x: body.center.x, y: body.center.y })
                : undefined;
        if (!this.diveTarget) {
            this.divePrompt.hide();
        } else if (this.diveTarget.trigger === "auto" && this.diveTarget.distance <= AUTO_DIVE_DISTANCE) {
            // Water set to dive on contact: touching its edge is enough.
            this.dive();
        } else {
            this.divePrompt.show(this.dive);
        }
    }

    private readonly dive = (): void => {
        const target = this.diveTarget;
        if (!target || this.swimming) return;
        this.divePrompt.hide();
        this.swimming = true;
        // The target is where the center of the body lands; a path goes to the feet: the bottom of the body.
        const body = this.getBody();
        this.setPathToFollow([{ x: target.x, y: target.y + body.height / 2 }], WOKA_SPEED).catch((e) =>
            console.warn(e),
        );
    };

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
        this.divePrompt.hide();
        this.sitPrompt.hide();
        this.destinationMarker.destroy();
        this.actionPrompt.hide();
        super.destroy();
    }
}
