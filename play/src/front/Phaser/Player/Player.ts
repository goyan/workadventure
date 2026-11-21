import type { Unsubscriber } from "svelte/store";
import { get } from "svelte/store";
import type { CancelablePromise } from "cancelable-promise";
import { AskPositionMessage_AskType, PositionMessage_Direction } from "@workadventure/messages";
import {
    CANOE_CURRENT_SHARE,
    CANOE_SPEED_FACTOR,
    CANOE_SPRINT_FACTOR,
    isCanoeAfloat,
    AIRPLANE_MIN_FLIGHT_ALTITUDE,
    Vehicle,
    VehicleMedium,
    vehicleMedia,
    activeVehicleMedium,
    VehicleMode,
    VEHICLE_VARIABLE,
    vehicleSpeedFactor,
    readVehicleState,
    vehiclePhysicsFps,
} from "@wa/front/Phaser/Vehicle/Vehicle";
import { isHumanAvatar } from "@wa/front/Phaser/Entity/MusicHeadphonesEffect";
import type { GameScene } from "@wa/front/Phaser/Game/GameScene";
import type { ActiveEventList } from "@wa/front/Phaser/UserInput/UserInputManager";
import { UserInputEvent } from "@wa/front/Phaser/UserInput/UserInputManager";
import { Character } from "@wa/front/Phaser/Entity/Character";
import type { PathFollowResult } from "@wa/front/Phaser/Entity/Character";
import { PathTileType } from "@wa/front/Utils/PathfindingManager";
import { getPrefabCollisionRectangles } from "@wa/front/Utils/PrefabCollisionRectangles";
import { getSolidRectangles } from "@wa/front/Utils/EntityHitbox";
import { isWaypointBlocked } from "@wa/front/Utils/PathValidation";
import { userMovingStore, userSeatedStore } from "@wa/front/Stores/GameStore";
import { followStateStore, followRoleStore, followUsersStore } from "@wa/front/Stores/FollowStore";
import { ENABLE_TILE_SNAP, WOKA_SPEED } from "@wa/front/Enum/EnvironmentVariable";
import { visibilityStore } from "@wa/front/Stores/VisibilityStore";
import { passStatusToOnline } from "@wa/front/Rules/StatusRules/statusChangerFunctions";
import { localUserStore } from "@wa/front/Connection/LocalUserStore";
import { bindingKeys, shortcutsStore } from "@wa/front/Stores/ShortcutsStore";
import { WalkDestinationMarker } from "@wa/front/Phaser/Components/WalkDestinationMarker";
import { RunSmokeTrail } from "@wa/front/Phaser/Components/RunSmokeTrail";
import { findDiveTarget, getWaterRectangles, intersectsWater } from "@wa/front/Phaser/Game/Water/WaterZones";
import { InteractionPrompt } from "@wa/front/Phaser/Game/Water/InteractionPrompt";
import { iceStep, type Vector } from "@wa/front/Phaser/Game/Ice/IcePhysics";
import LL from "@wa/i18n/i18n-svelte";
import {
    AvatarAction,
    AVATAR_ACTION_VARIABLE,
    readAvatarAction,
    takesObjectPlace,
} from "@wa/front/Phaser/Entity/AvatarAction";
import { bodyBoxFromSprite, type BodyBox } from "@wa/front/Utils/BodyBox";
import {
    readSwimwear,
    readSwimwearColor,
    SWIMWEAR_VARIABLE,
    SWIMWEAR_COLOR_VARIABLE,
} from "@wa/front/Phaser/Entity/Swimwear";
import { NERF_KNOCKBACK_MS, NERF_KNOCKBACK_PX } from "../Game/Nerf/NerfBlink";
import { AirplaneFlight } from "../Vehicle/AirplaneFlight";
import { altitudeCommand } from "../Vehicle/AirplaneAltitudeKeys";
import { findLandingZone, type LandingPoint } from "../Vehicle/AirplaneLanding";
import { FLOOR_Z_VARIABLE } from "../Game/Floors/FloorProtocol";
import { groundPace } from "../Game/Terrain/GroundPace";
import { isInActiveConversationStore } from "../../Stores/StreamableCollectionStore";
import { isBasicActive } from "../../Stores/BasicModeStore";
import { RUN_ANIMATION_SPEED } from "./Animation";
import { computeTileSnapTarget, getFeetTile } from "./TileSnap";
import type { Seat } from "./Seat";
import { findSeatOfCharacter, findSeatUnderFeet, getSeats, isSeatTaken } from "./Seat";
import { findActionableObject } from "./ActionableObjects";

const LANDING_FOOTPRINT_SAMPLES = [-31, -16, 0, 16, 31];
/** A landing aims this far ahead of the plane: it glides down forward instead of sinking straight down. */
const LANDING_GLIDE_AHEAD = 192;
/** Ground speed of the approach (px/s). */
const LANDING_APPROACH_SPEED = 180;
/**
 * How often a climbing or descending plane tells its altitude to the others at most (ms): they ease towards it.
 * Any other change of the vehicle is told at once.
 */
const ALTITUDE_PUBLICATION_MS = 200;
/** How long a hint of the airplane key stays (ms). */
const AIRPLANE_PROMPT_MS = 15_000;

/** The object the avatar can act on is searched again at least this often while it stands still. */
const ACTION_SEARCH_KEPT_MS = 250;

/** Water set to dive on contact: the body center this close to it makes the player dive. */
const AUTO_DIVE_DISTANCE = 10;
/** How deep a body must be in the water to swim without diving (Arcade's overlap bias). */
const EMBEDDED_MARGIN = 4;
/** Swimming is slower than walking. */
const SWIM_SPEED_FACTOR = 0.6;

export const hasMovedEventName = "hasMoved";
export const startMovingEventName = "startMoving";
export const requestEmoteEventName = "requestEmote";

/** How far from its seat (in tiles) a run aimed at it may end and still slide onto it. */
const SEAT_RUN_REACH_TILES = 1.5;

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
    private airVehicleActive = false;
    private readonly flight = new AirplaneFlight();
    private clearAirVehicleOnLanding = false;
    /**
     * The pilot asked to get out (V in flight): the landing ends on foot. Landing by itself, when the arrows are let
     * go, the plane stays parked on the ground until V.
     */
    private exitOnLanding = false;
    private landingRequested = false;
    private airSteering = false;
    /** The pilot was flying the plane on the last frame: arrows, climb (space) or descent (control) held. */
    private airPiloted = false;
    private landingTarget: LandingPoint | undefined;
    /** Where the glide towards `target` started: the altitude falls with the distance left, to 0 on the point. */
    private landingApproach: { target: LandingPoint; distance: number; altitude: number } | undefined;
    private landingClearance: ((point: LandingPoint) => boolean) | undefined;
    private nextLandingCheck = 0;
    private sharedFlightLevel: number | undefined;
    private nextVehiclePublication = 0;
    private lastVehicleStructure: string | undefined;
    private lastLegacyVehicle: string | undefined;
    private landVehicleMode = VehicleMode.Off;
    private currentVehicleMedium = VehicleMedium.Land;
    private publishedMediumStates = new Map<string, string>();
    private diveTarget: ReturnType<typeof findDiveTarget>;
    private readonly divePrompt: InteractionPrompt;
    private readonly sitPrompt: InteractionPrompt;
    private readonly actionPrompt: InteractionPrompt;
    /** How to come down: land while flying, get off once the plane stands on the ground. */
    private readonly landPrompt: InteractionPrompt;
    private readonly leavePrompt: InteractionPrompt;
    /** Which of them was last shown, and until when: each one shows once per take-off or landing, for a moment. */
    private airplanePrompt: { prompt: InteractionPrompt; until: number } | undefined;
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
        this.scene.physics.world.setFPS(vehiclePhysicsFps(WOKA_SPEED, this.getBody()));
        this.destinationMarker = new WalkDestinationMarker(Scene);
        this.runSmokeTrail = new RunSmokeTrail(Scene);
        this.divePrompt = new InteractionPrompt(Scene, "water-dive", () => get(LL).trigger.swim());
        this.landPrompt = new InteractionPrompt(Scene, "airplane-land", () =>
            get(LL).trigger.landAirplane({ key: airVehicleKey() }),
        );
        this.leavePrompt = new InteractionPrompt(Scene, "airplane-leave", () =>
            get(LL).trigger.leaveAirplane({ key: airVehicleKey() }),
        );
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

    /** Whether the last movement was a run (Shift or a double-click path). */
    private lastRunning = false;
    /** A Nerf hit pushing the avatar back: until when, and at which velocity. */
    private knockback: { until: number; vx: number; vy: number } | undefined;

    public isRunning(): boolean {
        return this.lastRunning;
    }

    /**
     * Pushes the avatar back along a Nerf dart that hit it (`dx`, `dy`: the dart's direction, of length 1), even when
     * it stands still. The walls stop it as any move; it keeps facing the same way.
     */
    public knockBack(dx: number, dy: number): void {
        if (this.isSlidingToSeat) return;
        if (this.isSeated()) this.standUp();
        this.finishFollowingPath(true);
        const speed = (NERF_KNOCKBACK_PX * 1000) / NERF_KNOCKBACK_MS;
        this.knockback = { until: this.scene.time.now + NERF_KNOCKBACK_MS, vx: dx * speed, vy: dy * speed };
    }

    /** Pushed back by a Nerf hit: the keys are ignored until the push ends. Returns whether the avatar is pushed. */
    private knockBackStep(): boolean {
        if (!this.knockback) return false;
        const body = this.getBody();
        if (this.scene.time.now >= this.knockback.until) {
            this.knockback = undefined;
            // On the ice the avatar glides on from the push; elsewhere it stops where the push ends.
            if (!this.isOnIceHere()) body.setVelocity(0, 0);
            return false;
        }
        body.setVelocity(this.knockback.vx, this.knockback.vy);
        this.isMoving = true;
        userMovingStore.set(true);
        this.emit(hasMovedEventName, {
            moving: true,
            running: false,
            direction: this._lastDirection,
            x: this.x,
            y: this.y,
        });
        return true;
    }

    public moveUser(delta: number, activeUserInputEvents: ActiveEventList): void {
        if (this.knockBackStep()) return;
        this.updateSwimming();
        if (this.swimming || get(followStateStore) !== "off") this.equipVehicle(VehicleMode.Off);
        this.updateCanoe();
        if (activeUserInputEvents.get(UserInputEvent.VehicleSprint) && this.vehicleMode !== VehicleMode.Always)
            this.equipVehicle(VehicleMode.Sprint);
        if (
            this.vehicleMode === VehicleMode.Sprint &&
            !activeUserInputEvents.get(UserInputEvent.SpeedUp) &&
            !this.pathToFollow
        )
            this.equipVehicle(VehicleMode.Off);
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
        } else if (!this.pathToFollow && state === "off" && this.vehicleMode === VehicleMode.Off) {
            // Sit automatically only once stopped on a seat: walking or running past one keeps the move going.
            this.trySitDown(!this.hasMovementInput(activeUserInputEvents));
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
        if (this.pathToFollow && this.airVehicleActive) {
            const target = this.pathToFollow[this.pathToFollow.length - 1];
            const feet = this.getFeet();
            const dx = (target?.x ?? feet.x) - feet.x;
            const dy = (target?.y ?? feet.y) - feet.y;
            const distance = Math.hypot(dx, dy);
            this.getBody().setDirectControl(false);
            if (distance < 6) this.finishFollowingPath();
            const approach = Math.min(1, distance / 96);
            this.inputStep(
                activeUserInputEvents,
                distance > 0 ? (dx / distance) * approach : 0,
                distance > 0 ? (dy / distance) * approach : 0,
                delta,
            );
        } else if (this.pathToFollow) {
            this.followPath(delta);
        } else {
            this.inputStep(activeUserInputEvents, x, y, delta);
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
            this.equipVehicle(VehicleMode.Off);
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
        this.scene.coffeeManager?.onLocalAction(action);
    }

    public chooseVehicle(medium: VehicleMedium, vehicle: Vehicle): void {
        if (medium === VehicleMedium.Air && vehicle === Vehicle.None && this.airVehicleActive) {
            if (!this.landAirVehicle()) return;
            if (this.airVehicleActive) {
                this.clearAirVehicleOnLanding = true;
                return;
            }
        }
        localUserStore.setVehicleForMedium(medium, vehicle);
        this.refreshVehicles();
    }

    public toggleAirVehicle(): void {
        if (this.airVehicleActive) {
            if (this.landingRequested && this.exitOnLanding) {
                this.flight.cancelLanding();
                this.landingRequested = false;
                this.landingTarget = undefined;
                this.clearAirVehicleOnLanding = false;
                this.exitOnLanding = false;
                return;
            }
            this.landAirVehicle();
            return;
        }
        if (
            localUserStore.getVehicleForMedium(VehicleMedium.Air) === Vehicle.None ||
            this.isSlidingToSeat ||
            get(followStateStore) !== "off" ||
            !isHumanAvatar(this.sprites.keys())
        )
            return;
        this.setAvatarAction(AvatarAction.Idle);
        this.standUp();
        this.finishFollowingPath(true);
        const elevation = this.getFloorZ();
        if (elevation > 0) {
            this.setPosition(this.x, this.y + elevation);
            this.setFloorZ(0);
        }
        this.flight.reset(elevation);
        this.landingRequested = false;
        this.airSteering = false;
        this.airPiloted = false;
        this.airVehicleActive = true;
        this.swimming = false;
        this.refreshVehicles();
    }

    private landAirVehicle(): boolean {
        if (this.flight.altitude === 0) {
            if (!this.canLandHere()) return false;
            this.finishAirFlight();
        } else {
            this.landingRequested = true;
            this.exitOnLanding = true;
            this.nextLandingCheck = 0;
        }
        return true;
    }

    private finishAirFlight(): void {
        this.airVehicleActive = false;
        this.exitOnLanding = false;
        this.airplanePrompt?.prompt.hide();
        this.airplanePrompt = undefined;
        this.flight.reset();
        this.landingRequested = false;
        this.landingTarget = undefined;
        this.airSteering = false;
        this.airPiloted = false;
        if (this.clearAirVehicleOnLanding) localUserStore.setVehicleForMedium(VehicleMedium.Air, Vehicle.None);
        this.clearAirVehicleOnLanding = false;
        this.refreshVehicles();
        this.shareFlightLevel();
    }

    private shareFlightLevel(): void {
        const z = this.getFloorZ();
        if (this.sharedFlightLevel === z) return;
        this.sharedFlightLevel = z;
        this.scene.getGameMapFrontWrapper().setPosition?.(this.x, this.y, z);
        this.scene.getPlayerVariablesManager()?.setVariableFromApp(FLOOR_Z_VARIABLE, z, {
            public: true,
            persist: false,
            scope: "room",
        });
    }

    private landingZoneClearance(): (point: LandingPoint) => boolean {
        const map = this.scene.getGameMapFrontWrapper();
        const tile = map.getTileDimensions();
        const grid = map.getCollisionGrid({ emitMapChangedEvent: false });
        const obstacles = map.getLandingObstacles();
        const outdoor = this.scene.getOutdoorGrid();
        return (point) => {
            if (obstacles.blocksPoint(point)) return false;
            // Both edges of the 64 px footprint, and every tile in between (16 px apart at most).
            for (const dy of LANDING_FOOTPRINT_SAMPLES) {
                for (const dx of LANDING_FOOTPRINT_SAMPLES) {
                    const x = point.x + dx;
                    const y = point.y + dy;
                    if (grid[Math.floor(y / tile.height)]?.[Math.floor(x / tile.width)] !== 0) return false;
                    if (outdoor && !outdoor.isOutdoorAt(x, y)) return false;
                    // No altitude: the ground (AreaPosition), where the plane is about to land.
                    if (!this.scene.isPositionAllowedForCurrentUser({ x, y })) return false;
                }
            }
            return true;
        };
    }

    /** The point a landing aims at: ahead of the plane in the way it flies, under it when it hovers. */
    private glideOrigin(feet: LandingPoint): LandingPoint {
        const { x, y } = this.flight.speed;
        const length = Math.hypot(x, y);
        if (length < 1) return feet;
        return { x: feet.x + (x / length) * LANDING_GLIDE_AHEAD, y: feet.y + (y / length) * LANDING_GLIDE_AHEAD };
    }

    /**
     * The hint of the airplane key, discreet: to land on taking off, to get off once landed. Each shows once when the
     * plane changes state and goes away by itself after a moment.
     */
    private updateAirplanePrompts(): void {
        const now = this.scene.time.now;
        const wanted = this.flight.altitude === 0 ? this.leavePrompt : this.exitOnLanding ? undefined : this.landPrompt;
        if (wanted !== this.airplanePrompt?.prompt) {
            this.airplanePrompt?.prompt.hide();
            this.airplanePrompt = wanted && { prompt: wanted, until: now + AIRPLANE_PROMPT_MS };
            wanted?.show(() => this.toggleAirVehicle());
        } else if (this.airplanePrompt && now >= this.airplanePrompt.until) {
            this.airplanePrompt.prompt.hide();
        }
    }

    /** Landed by itself: the plane stays on the ground, propeller at rest, until V or the arrows take off again. */
    private parkAirplane(): void {
        this.flight.reset();
        this.landingRequested = false;
        this.landingTarget = undefined;
        this.landingApproach = undefined;
        this.airSteering = false;
        this.airPiloted = false;
        this.setFlightAltitude(0);
        this.shareFlightLevel();
    }

    /**
     * The climb (space) or descent (control) the pilot asks for. Coming down to the lowest flight level and holding
     * the key lands, on clear ground as any landing: the keys never set the plane down anywhere.
     */
    private pilotAltitude(activeEvents: ActiveEventList): -1 | 0 | 1 {
        const climb = altitudeCommand(
            activeEvents.get(UserInputEvent.Climb),
            activeEvents.get(UserInputEvent.Descend) && this.flight.altitude > 0,
        );
        if (climb === 0) return 0;
        if (climb < 0 && !this.landingRequested && this.flight.altitude <= AIRPLANE_MIN_FLIGHT_ALTITUDE) {
            this.landingRequested = true;
            this.nextLandingCheck = 0;
        }
        return climb;
    }

    /** Whether the hint of the airplane key is shown: its prompt answers the space key too (see InteractionPrompt). */
    public isAirplanePromptShown(): boolean {
        return this.airplanePrompt?.prompt.isShown ?? false;
    }

    private canLandHere(): boolean {
        return this.landingZoneClearance()(this.getFeet());
    }

    /**
     * Letting go of every key that flies the plane (arrows, space, control) lands it, whatever altitude the pilot
     * chose: the keys of the altitude only act while the plane is flown. Taking the arrows again cancels any landing;
     * climbing with the arrows held cancels a landing the plane began by itself, not one the airplane key asked for.
     */
    private steerAirplane(x: number, y: number, climb: -1 | 0 | 1 = 0): LandingPoint {
        const steering = x !== 0 || y !== 0;
        const piloted = steering || climb !== 0;
        if (steering && !this.airSteering) {
            this.landingRequested = false;
            this.landingTarget = undefined;
            this.flight.landing = false;
            this.clearAirVehicleOnLanding = false;
            this.exitOnLanding = false;
        } else if (
            steering &&
            climb > 0 &&
            this.landingRequested &&
            !this.exitOnLanding &&
            !this.clearAirVehicleOnLanding
        ) {
            this.landingRequested = false;
            this.landingTarget = undefined;
            this.landingApproach = undefined;
            this.flight.landing = false;
            this.flight.glideAltitude = undefined;
        } else if (!piloted && this.airPiloted && this.flight.altitude > 0) {
            this.landingRequested = true;
            this.nextLandingCheck = 0;
        }
        this.airSteering = steering;
        this.airPiloted = piloted;
        if (!this.landingRequested) {
            this.flight.glideAltitude = undefined;
            return { x, y };
        }
        const feet = this.getFeet();
        const now = this.scene.time.now;
        if (now >= this.nextLandingCheck) {
            this.nextLandingCheck = now + 500;
            this.landingClearance = this.landingZoneClearance();
            if (!this.landingTarget || !this.landingClearance(this.landingTarget)) {
                // The clear ground nearest to where the plane is heading: right ahead over open ground, the
                // nearest way out over a building.
                this.landingTarget = findLandingZone(
                    this.glideOrigin(feet),
                    this.scene.getGameMapFrontWrapper().getTileDimensions(),
                    this.landingClearance,
                );
            }
        }
        const target = this.landingTarget;
        if (!target) {
            // No clear ground in reach: hold the altitude and look again.
            this.flight.landing = false;
            this.flight.glideAltitude = undefined;
            return { x: 0, y: 0 };
        }
        const dx = target.x - feet.x;
        const dy = target.y - feet.y;
        const distance = Math.hypot(dx, dy);
        if (this.landingApproach?.target !== target) {
            this.landingApproach = { target, distance: Math.max(distance, 1), altitude: this.flight.altitude };
        }
        const approach = this.landingApproach;
        this.flight.glideAltitude = approach.altitude * Math.min(1, distance / approach.distance);
        this.flight.landing = distance < 4 && (this.landingClearance?.(feet) ?? false);
        const speed = Math.min(LANDING_APPROACH_SPEED, Math.max(40, distance * 3));
        return distance > 0 ? { x: (dx / distance) * speed, y: (dy / distance) * speed } : { x: 0, y: 0 };
    }

    public refreshVehicles(): void {
        this.updateCanoe();
        this.scene.markDirty();
    }

    public equipVehicle(mode: VehicleMode): void {
        const vehicle = localUserStore.getVehicleForMedium(VehicleMedium.Land);
        if (mode !== VehicleMode.Off) {
            if (
                vehicle === Vehicle.None ||
                this.swimming ||
                this.isInWater() ||
                this.isSlidingToSeat ||
                get(followStateStore) !== "off" ||
                !isHumanAvatar(this.sprites.keys())
            )
                return;
            this.setAvatarAction(AvatarAction.Idle);
            this.standUp();
        }
        this.landVehicleMode = mode;
        if (this.currentVehicleMedium !== undefined && this.currentVehicleMedium !== VehicleMedium.Land) return;
        this.setVehicle({ vehicle, mode, ...localUserStore.getVehicleColors(vehicle) });
    }

    /** Selects the vehicle for the current medium, keeping the land mode while an automatic vehicle takes over. */
    protected updateCanoe(): void {
        if (this.airVehicleActive && get(followStateStore) !== "off") {
            this.scene.connection?.emitFollowAbort();
            followStateStore.set("off");
        }
        if (!isHumanAvatar(this.sprites.keys())) this.airVehicleActive = false;
        const mediumId = activeVehicleMedium({
            // A pool is no water for a canoe: one swims in it.
            deepWater: this.isOverDeepTerrainWater() && !this.isInPool(),
            airborne: this.airVehicleActive,
        });
        const medium = vehicleMedia.find((entry) => entry.id === mediumId);
        if (!medium) return;
        const vehicle = localUserStore.getVehicleForMedium(mediumId);
        if (mediumId === VehicleMedium.Land && vehicle === Vehicle.None) this.landVehicleMode = VehicleMode.Off;
        const allowed =
            !this.swimming &&
            !this.isSlidingToSeat &&
            get(followStateStore) === "off" &&
            isHumanAvatar(this.sprites.keys());
        const mode =
            !allowed || vehicle === Vehicle.None
                ? VehicleMode.Off
                : medium.automatic
                  ? VehicleMode.Always
                  : (this.landVehicleMode ?? VehicleMode.Off);
        this.currentVehicleMedium = mediumId;
        if (medium.automatic && mode !== VehicleMode.Off && this.vehicleMode === VehicleMode.Off) {
            this.setAvatarAction(AvatarAction.Idle);
            this.standUp();
        }
        this.setVehicle({
            vehicle,
            mode,
            ...localUserStore.getVehicleColors(vehicle),
            ...(vehicle === Vehicle.Airplane ? { altitude: this.flight.altitude } : {}),
        });
    }

    private vehicleStateForTrail(): { vehicle: Vehicle; mode: VehicleMode } {
        return { vehicle: this.vehicle, mode: this.vehicleMode };
    }

    /** The speed of the avatar in its canoe: the one of a walker, faster when paddling hard. */
    protected canoeSpeed(speedUp: boolean): number {
        return WOKA_SPEED * (speedUp ? CANOE_SPRINT_FACTOR : CANOE_SPEED_FACTOR);
    }

    public override setVehicle(value: unknown): void {
        const state = readVehicleState(value);
        super.setVehicle(state);
        const manager = this.scene.getPlayerVariablesManager();
        if (!manager) return;
        const preferences = localUserStore.getVehiclePreferences();
        const { altitude, ...baseState } = state;
        const structure = JSON.stringify({ ...baseState, preferences });
        const now = this.scene.time?.now ?? 0;
        if (structure === this.lastVehicleStructure && now < this.nextVehiclePublication) return;
        this.lastVehicleStructure = structure;
        this.nextVehiclePublication = now + ALTITUDE_PUBLICATION_MS;
        this.publishedMediumStates ??= new Map<string, string>();
        for (const medium of vehicleMedia) {
            const selected = preferences[medium.id];
            const active = medium.id === (this.currentVehicleMedium ?? VehicleMedium.Land);
            const mediumState = {
                ...baseState,
                vehicle: selected,
                mode: active ? state.mode : VehicleMode.Off,
                ...(selected === Vehicle.Airplane ? { altitude: active ? Math.round(altitude ?? 0) : 0 } : {}),
            };
            const serialized = JSON.stringify(mediumState);
            if (this.publishedMediumStates.get(medium.variable) !== serialized) {
                manager.setVariableFromApp(medium.variable, mediumState, {
                    public: true,
                    persist: false,
                    scope: "room",
                });
                this.publishedMediumStates.set(medium.variable, serialized);
            }
        }
        const legacyState = {
            ...baseState,
            ...(state.vehicle === Vehicle.Airplane ? { altitude: Math.round(altitude ?? 0) } : {}),
        };
        const serialized = JSON.stringify(legacyState);
        if (serialized !== this.lastLegacyVehicle) {
            manager.setVariableFromApp(VEHICLE_VARIABLE, legacyState, { public: true, persist: false, scope: "room" });
            this.lastLegacyVehicle = serialized;
        }
    }

    protected override getPathWalkingSpeed(): number {
        return this.vehicleMode !== VehicleMode.Off && !this.swimming && !this.isSlidingToSeat
            ? WOKA_SPEED * vehicleSpeedFactor(this.vehicle)
            : super.getPathWalkingSpeed();
    }

    public override setSwimwearColor(value: unknown): void {
        const color = readSwimwearColor(value);
        super.setSwimwearColor(color);
        localUserStore.setSwimwearColor(color);
        this.scene
            .getPlayerVariablesManager()
            ?.setVariableFromApp(SWIMWEAR_COLOR_VARIABLE, color ?? null, { public: true });
    }

    public override setSwimwear(value: unknown): void {
        const style = readSwimwear(value);
        super.setSwimwear(style);
        localUserStore.setSwimwear(style);
        this.scene.getPlayerVariablesManager()?.setVariableFromApp(SWIMWEAR_VARIABLE, style, { public: true });
    }

    /** The last search of the object the avatar can act on, and where it stood then (see updateObjectAction). */
    private actionSearch:
        | { x: number; y: number; floor: number; at: number; object: ReturnType<typeof findActionableObject> }
        | undefined;

    private updateObjectAction(): void {
        if (this.isFlying()) {
            this.actionPrompt.hide();
            return;
        }
        const body = this.getBody();
        const feet = { x: this.x, y: this.y + body.offset.y + body.height / 2 };
        const floor = this.getFloorZ();
        // Every object of the map is looked at: not again while the avatar stands where it stood, except a few
        // times a second (an object may be placed, moved or removed next to it).
        const now = performance.now();
        const searched = this.actionSearch;
        let object: ReturnType<typeof findActionableObject>;
        if (
            searched &&
            searched.x === feet.x &&
            searched.y === feet.y &&
            searched.floor === floor &&
            now - searched.at < ACTION_SEARCH_KEPT_MS
        ) {
            object = searched.object;
        } else {
            // The objects of the floor the avatar stands on.
            object = findActionableObject(this.scene, feet, floor);
            this.actionSearch = { ...feet, floor, at: now, object };
        }
        if (object?.entityId !== this.ignoredActionObjectId) this.ignoredActionObjectId = undefined;
        if (object?.entityId !== this.actionObject?.entityId || object?.action !== this.actionObject?.action)
            this.actionPrompt.hide();
        this.actionObject = object;
        if (
            this.vehicleMode !== VehicleMode.Off ||
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
            if (takesObjectPlace(object.action)) {
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

    /** The box of the body, from the sprite: `body.x/y` may be stale (see bodyBoxFromSprite). */
    public getBodyBox(): BodyBox {
        return bodyBoxFromSprite(this, this.getBody());
    }

    /**
     * Sits on the free seat under the feet of the player (within half a tile of it, or against its object): slides to
     * its center, then faces the way of the seat. Automatically only once stopped (`allowAutomaticSitting`).
     */
    private trySitDown(allowAutomaticSitting: boolean): void {
        this.releaseSeatObjectWhenOut();
        // The seats of the floor the avatar stands on (none on a stair: no floor is at its altitude).
        const seat = findSeatUnderFeet(this.scene, this.getFeet(), this.getBodyBox(), this.getFloorZ());
        // The seat just left, and the other places of its couch, stay ignored until the player is off it.
        if (seat?.id !== this.ignoredSeatId) {
            this.ignoredSeatId = undefined;
        }
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
        if (allowAutomaticSitting) this.slideToSeat(seat);
    }

    private getFeet(): { x: number; y: number } {
        const body = this.getBody();
        return { x: this.x, y: this.y + body.height / 2 + body.offset.y };
    }

    /**
     * Sits on the seat a double-click aimed at, once the run there ended: the click asked for it, so an
     * interaction-key seat, the seat just left or another place of the same couch are sat on too, and a vehicle is
     * put away. Returns whether the player sits (or slides) onto it. The run stops next to a seat whose object blocks
     * its tile: the seat must be within reach.
     */
    public sitOnSeat(seatId: string): boolean {
        const seat = getSeats(this.scene, this.getFloorZ()).find((candidate) => candidate.id === seatId);
        if (!seat) return false;
        if (this.isSeated() && findSeatOfCharacter(this.scene, this)?.id === seat.id) return true;
        if (
            this.isSlidingToSeat ||
            this.swimming ||
            this.isInWater() ||
            get(followStateStore) !== "off" ||
            isSeatTaken(this.scene, seat)
        ) {
            return false;
        }
        const feet = this.getFeet();
        const { width } = this.scene.getGameMapFrontWrapper().getTileDimensions();
        if (Math.hypot(seat.feet.x - feet.x, seat.feet.y - feet.y) > width * SEAT_RUN_REACH_TILES) return false;
        if (this.vehicleMode !== VehicleMode.Off) this.equipVehicle(VehicleMode.Off);
        this.ignoredSeatId = undefined;
        this.ignoredSeatEntityId = undefined;
        this.sitPrompt.hide();
        this.slideToSeat(seat);
        return true;
    }

    /**
     * After a double-click run that did not aim at a seat: the player stays standing where it ended, even against a
     * seat, until it walks away from it (walking or running past a seat never pulls the player onto it).
     */
    public stayStandingHere(): void {
        const seat = findSeatUnderFeet(this.scene, this.getFeet(), this.getBodyBox(), this.getFloorZ());
        if (!seat) return;
        this.ignoredSeatId = seat.id;
        this.ignoredSeatEntityId = seat.entityId;
        this.sitPrompt.hide();
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
        const position = { x: entity?.x ?? 0, y: entity?.y ?? 0 };
        const solid = entity
            ? getSolidRectangles(
                  position,
                  entity.getPrefab(),
                  this.scene.getGameMapFrontWrapper().getTileDimensions().width,
              )
            : [];
        const stillInside = getPrefabCollisionRectangles(position, solid).some(
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
        if (this.vehicleMode !== VehicleMode.Off && !followMode && !this.swimming) {
            if (this.vehicle === Vehicle.Canoe) return this.canoeSpeed(speedUp);
            return WOKA_SPEED * vehicleSpeedFactor(this.vehicle) * (this.isFlying() ? 1 : this.soilPace());
        }
        const speed = this.pathWalkingSpeed
            ? this.pathWalkingSpeed
            : speedUp && !followMode
              ? 2.5 * WOKA_SPEED
              : WOKA_SPEED;
        return this.swimming ? speed * SWIM_SPEED_FACTOR : speed * this.soilPace();
    }

    /** The soil under the feet slows the avatar down (sand, the mud of a wet clay): on the ground only. */
    private soilPace(): number {
        // Basique: the ground slows nobody down (no mud, sand nor snow to see).
        const water = this.getFloorZ() < 2 && !isBasicActive() ? this.scene?.getTerrainWater?.() : undefined;
        if (!water) return 1;
        const feet = this.getFeet();
        const meadow = this.scene.getMeadow?.();
        return groundPace(
            water,
            feet.x,
            feet.y,
            this.scene.time.now,
            meadow ? (x, y) => meadow.moistureAt(x, y) : undefined,
            this.scene.getGroundSeason?.(),
            (x, y) => this.scene.getSnowCoverAt?.(x, y) ?? 0,
        );
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
        if (this.airVehicleActive) {
            this.swimming = false;
            this.divePrompt.hide();
            return;
        }
        // The water of the floor the avatar stands on (none on a stair).
        const water = getWaterRectangles(this.scene, this.getFloorZ());
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

    private inputStep(activeEvents: ActiveEventList, x: number, y: number, delta: number) {
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
        if (this.airVehicleActive) {
            const climb = this.pilotAltitude(activeEvents);
            const wanted = this.steerAirplane(x, y, climb);
            const flight = this.flight.step(wanted, delta, climb);
            x = flight.x;
            y = flight.y;
            this.setFlightAltitude(flight.altitude);
            this.shareFlightLevel();
            this.updateAirplanePrompts();
            if (flight.landed) {
                if (this.canLandHere()) {
                    if (this.exitOnLanding || this.clearAirVehicleOnLanding) this.finishAirFlight();
                    else this.parkAirplane();
                } else {
                    this.flight.cancelLanding();
                    this.setFlightAltitude(this.flight.altitude);
                    this.landingTarget = undefined;
                    this.nextLandingCheck = 0;
                }
            }
        }
        // What the keys ask for, before the water has its say: the avatar keeps facing where it is steered.
        const steeredX = x;
        const steeredY = y;
        // In a call the current carries nobody: it would take one out of the bubble of the conversation.
        if (!followMode && !this.isInAirplane() && !this.isSeated() && !get(isInActiveConversationStore)) {
            // The current of the water of the relief carries the avatar, on top of what it does by itself.
            const push = this.waterCurrentPush(WOKA_SPEED * 20);
            // A canoe holds against the current better than a swimmer.
            const carried = isCanoeAfloat(this.getVehicleState()) ? CANOE_CURRENT_SHARE : 1;
            x += push.x * carried;
            y += push.y * carried;
        }

        if (!followMode && this.vehicleMode === VehicleMode.Off && !this.isSeated() && this.isOnIceHere()) {
            this.glideOnIce({ x, y }, speedUp, delta);
            return;
        }

        // Compute moving state
        const moving = x !== 0 || y !== 0;

        // Compute direction
        let direction = this._lastDirection;
        if (steeredX !== 0 || steeredY !== 0) {
            if (Math.abs(steeredX) > Math.abs(steeredY)) {
                direction = steeredX < 0 ? PositionMessage_Direction.LEFT : PositionMessage_Direction.RIGHT;
            } else {
                direction = steeredY < 0 ? PositionMessage_Direction.UP : PositionMessage_Direction.DOWN;
            }
        }

        // Send movement events
        // Carried by the water without steering, the avatar drifts: it does not run.
        const steered = steeredX !== 0 || steeredY !== 0;
        const running = steered && speedUp && !followMode && this.vehicleMode === VehicleMode.Off;
        this.lastRunning = running;
        // The others are told it walks only when it is steered: carried by the water, it is seen drifting, still.
        const emit = () => this.emit(hasMovedEventName, { moving: steered, running, direction, x: this.x, y: this.y });
        if (moving) {
            if (!this.isMoving) {
                this.isMoving = true;
                this.emit(startMovingEventName, { direction, x: this.x, y: this.y });
            }
            this.moveBy(x, y, running, steered);
            // Dust behind a runner or a ride of the ground, none behind a canoe.
            if (
                (running || this.isRidingVehicle()) &&
                !this.isFlying() &&
                !isCanoeAfloat(this.vehicleStateForTrail())
            ) {
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
            if (!this.airVehicleActive) this.snapToTileCenter();
        }

        // Update state
        userMovingStore.set(moving);
    }

    /**
     * On the ice, the avatar eases towards the velocity the keys ask for (`wanted`) and glides on once they are
     * released (IcePhysics). It keeps telling the others it moves until it stops, without snapping to a tile.
     */
    private glideOnIce(wanted: Vector, speedUp: boolean, delta: number): void {
        const body = this.getBody();
        const velocity = iceStep(body.velocity, wanted, delta);
        const moving = velocity.x !== 0 || velocity.y !== 0;
        if (moving) {
            const running = speedUp && (wanted.x !== 0 || wanted.y !== 0);
            this.moveBy(velocity.x, velocity.y, running);
            if (!this.isMoving) {
                this.isMoving = true;
                this.emit(startMovingEventName, { direction: this._lastDirection, x: this.x, y: this.y });
            }
            this.emit(hasMovedEventName, {
                moving: true,
                running,
                direction: this._lastDirection,
                x: this.x,
                y: this.y,
            });
        } else {
            body.setVelocity(0, 0);
            if (get(userMovingStore)) {
                this.isMoving = false;
                this.stop();
                this.emit(hasMovedEventName, {
                    moving: false,
                    running: false,
                    direction: this._lastDirection,
                    x: this.x,
                    y: this.y,
                });
            }
        }
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
     * Moves the avatar at this speed. `walking` is false when nothing steers it and the current of the water alone
     * carries it: it then drifts as it stands, facing where it faced, without the animation of a walker.
     */
    private moveBy(x: number, y: number, running = false, walking = true) {
        this.lastRunning = running;
        const body = this.getBody();

        body.setVelocity(x, y);

        if (!walking) {
            passStatusToOnline();
            this.playAnimation(this._lastDirection, false, 1);
            if (this.companion) {
                this.companion.setTarget(this.x, this.y, this._lastDirection);
            }
            return;
        }

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

    private isRunningPath(): boolean {
        return (
            this.vehicleMode === VehicleMode.Off &&
            this.isFollowingPath() &&
            (this.pathWalkingSpeed ?? WOKA_SPEED) > WOKA_SPEED &&
            !this.swimming &&
            !this.isSlidingToSeat
        );
    }

    protected followPath(delta: number): void {
        super.followPath(delta);
        if (!this.isFollowingPath()) return;
        this.emit(hasMovedEventName, {
            moving: true,
            running: this.isRunningPath(),
            direction: this._lastDirection,
            x: this.x,
            y: this.y,
        });
    }

    protected moveToPathPosition(x: number, y: number): void {
        const oldX = this.x;
        const oldY = this.y;
        passStatusToOnline();
        super.moveToPathPosition(x, y);
        if (!this.isInAirplane() && (this.isRunningPath() || this.isRidingVehicle()) && (x !== oldX || y !== oldY)) {
            if (this.isRunningPath()) this.playAnimation(this._lastDirection, true, RUN_ANIMATION_SPEED);
            const body = this.getBody();
            this.runSmokeTrail.emit(
                this.x,
                this.y + body.offset.y + body.height / 2,
                x - oldX,
                y - oldY,
                this.depth - 1,
            );
        }
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

    // The interface follows whether the local player is seated ("my desk" buttons).
    public override sit(direction: PositionMessage_Direction): void {
        super.sit(direction);
        userSeatedStore.set(true);
    }

    public override standUp(): void {
        super.standUp();
        userSeatedStore.set(this.isSeated());
    }

    public teleportTo(x: number, y: number): void {
        this.standUp();
        this.setPosition(x, y);
        // The physics is paused while nothing moves (DirtyScene): the body must follow now. Its previous positions
        // follow too, so that the end of a physics step does not move the sprite again by the length of the teleport.
        const body = this.getBody();
        body.updateFromGameObject();
        body.prev.copy(body.position);
        body.prevFrame.copy(body.position);
        // Teleported onto the ice, the avatar arrives still: no glide carried over from where it was.
        body.setVelocity(0, 0);
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
        userSeatedStore.set(false);
        this.unsubscribeVisibilityStore();
        this.divePrompt.hide();
        this.sitPrompt.hide();
        this.destinationMarker.destroy();
        this.actionPrompt.hide();
        super.destroy();
    }
}

/** The key of the airplane, as the shortcuts settings name it (V unless changed). */
function airVehicleKey(): string {
    const binding = get(shortcutsStore).toggleAirVehicle;
    return binding ? bindingKeys(binding, get(LL).menu.shortcuts.keyNames.shift()).join("+") : "V";
}
