import { z } from "zod";
import { CustomEntityDirection } from "@workadventure/messages";

export type AtLeast<T, K extends keyof T> = Partial<T> & Pick<T, K>;

export enum Direction {
    Left = "Left",
    Up = "Up",
    Down = "Down",
    Right = "Right",
}

export const CollectionUrl = z.object({
    url: z.string(),
    type: z.union([z.literal("file"), z.literal("marketplace")]),
});

export const PropertyBase = z.object({
    id: z.string(),
    buttonLabel: z.string().optional(),
    hideButtonLabel: z.boolean().optional(),
    resourceUrl: z.string().optional(),
    serverData: z.unknown().optional(),
});

export const FocusablePropertyData = PropertyBase.extend({
    type: z.literal("focusable"),
    zoom_margin: z.number().optional(),
});

export const HighlightPropertyData = PropertyBase.extend({
    type: z.literal("highlight"),
    opacity: z.number().min(0).max(1).optional().default(0.6),
    gradientWidth: z.number().min(0).optional().default(10),
    duration: z.number().optional().default(250),
    color: z.string().optional().default("#000000"),
});

export const JitsiRoomConfigData = z.object({
    startWithAudioMuted: z.boolean().optional(),
    startWithVideoMuted: z.boolean().optional(),
});

export const LivekitRoomConfigData = z
    .object({
        startWithAudioMuted: z.boolean(),
        startWithVideoMuted: z.boolean(),
        disableChat: z.boolean().optional().default(false),
        // Whether attendees may raise their hand to ask for the floor. On by default, and absent from
        // maps built before the option existed, hence `.optional()` on top of the default.
        raiseHandEnabled: z.boolean().optional().default(true),
    })
    .optional();

export const SilentPropertyData = PropertyBase.extend({
    type: z.literal("silent"),
});

export const StartPropertyData = PropertyBase.extend({
    type: z.literal("start"),
    isDefault: z.boolean().optional(),
});

export const ExitPropertyData = PropertyBase.extend({
    type: z.literal("exit"),
    url: z.string(),
    areaName: z.string(),
});

export const JitsiRoomPropertyData = PropertyBase.extend({
    type: z.literal("jitsiRoomProperty"),
    roomName: z.string(),
    jitsiUrl: z.string().optional(),
    closable: z.boolean().optional(),
    trigger: z.union([z.literal("onenter"), z.literal("onaction"), z.literal("onicon")]).optional(),
    triggerMessage: z.string().optional(),
    noPrefix: z.boolean().optional(),
    width: z.number().min(1).max(100).default(50).optional(),
    jitsiRoomAdminTag: z.string().optional(),
    jitsiRoomConfig: JitsiRoomConfigData,
});

export const PlayAudioPropertyData = PropertyBase.extend({
    type: z.literal("playAudio"),
    audioLink: z.string(),
    /**
     * Name of the file uploaded to the map-storage, which audioLink then points to. Empty when
     * audioLink is a URL typed by the user.
     */
    audioName: z.string().nullable().optional(),
    volume: z.number().default(1).optional(),
    triggerMessage: z.string().optional(),
    /**
     * Broadcast the sound to every player of the map instead of only the one who activates it.
     * Entities only: on an area this would fire for anyone walking in.
     */
    playForAllUsers: z.boolean().optional(),
    /**
     * Distance in pixels beyond which a broadcast sound is not heard, the volume decreasing as it
     * is approached. Null or undefined means the sound is heard at full volume anywhere on the map
     * (an emptied number input is bound to null).
     */
    audibleRadius: z.number().min(0).nullable().optional(),
});

export const OpenWebsitePropertyData = PropertyBase.extend({
    type: z.literal("openWebsite"),
    link: z.string().nullable().default("https://workadventu.re"),
    newTab: z.boolean().optional().default(false),
    closable: z.boolean().optional(),
    allowAPI: z.boolean().optional(),
    trigger: z.union([z.literal("onenter"), z.literal("onaction"), z.literal("onicon")]).optional(),
    triggerMessage: z.string().optional(),
    width: z.number().min(1).max(100).default(50).optional(),
    policy: z
        .string()
        .default("fullscreen; accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture")
        .optional(),
    position: z.number().optional(),
    application: z.string().default("website"),
    poster: z.string().optional(),
    placeholder: z.string().optional(),
    icon: z.string().optional(),
    label: z.string().optional(),
    regexUrl: z.string().optional(),
    targetEmbedableUrl: z.string().optional(),
    forceNewTab: z.boolean().optional().default(false),
    hideUrl: z.boolean().optional().default(false),
});

export const OpenFilePropertyData = PropertyBase.extend({
    type: z.literal("openFile"),
    link: z.string().nullable().default("https://workadventu.re"),
    name: z.string().nullable(),
    newTab: z.boolean().optional().default(false),
    closable: z.boolean().optional(),
    trigger: z.union([z.literal("onenter"), z.literal("onaction"), z.literal("onicon")]).optional(),
    triggerMessage: z.string().optional(),
    width: z.number().min(1).max(100).default(50).optional(),
    policy: z
        .string()
        .default("fullscreen; accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture")
        .optional(),
    position: z.number().optional(),
    hideUrl: z.boolean().optional().default(false),
});

export const ExtensionModuleAreaProperty = PropertyBase.extend({
    type: z.literal("extensionModule"),
    subtype: z.string(),
    data: z.unknown(),
});

export const SpeakerMegaphonePropertyData = PropertyBase.extend({
    type: z.literal("speakerMegaphone"),
    name: z.string(),
    chatEnabled: z.boolean().default(false),
    seeAttendees: z.boolean().default(false),
});

export const ListenerMegaphonePropertyData = PropertyBase.extend({
    type: z.literal("listenerMegaphone"),
    speakerZoneName: z.string(),
    chatEnabled: z.boolean().default(false),
    allowTalking: z.boolean().optional().default(false),
    // Whether listeners may raise their hand to ask the speaker for the floor. On by default, and absent
    // from maps built before the option existed, hence `.optional()` on top of the default.
    raiseHandEnabled: z.boolean().optional().default(true),
    waitingLink: z.string().optional(),
});

export const EntityDescriptionPropertyData = PropertyBase.extend({
    type: z.literal("entityDescriptionProperties"),
    description: z.string().optional(),
    searchable: z.boolean().default(false),
});

export const AreaDescriptionPropertyData = PropertyBase.extend({
    type: z.literal("areaDescriptionProperties"),
    description: z.string().optional(),
    searchable: z.boolean().default(false),
});

export const RestrictedRightsPropertyData = PropertyBase.extend({
    type: z.literal("restrictedRightsPropertyData"),
    writeTags: z.array(z.string()).default([]),
    readTags: z.array(z.string()).default([]),
});

export const PersonalAreaAccessClaimMode = z.enum(["dynamic", "static"]);

export const PersonalAreaPropertyData = PropertyBase.extend({
    type: z.literal("personalAreaPropertyData"),
    accessClaimMode: PersonalAreaAccessClaimMode,
    allowedTags: z.array(z.string()).default([]),
    ownerId: z.string().nullable(), //Proto handle null here. If something goes wrong with personal area, this may be the issue
});

/**
 * A room where the guests of the same Teams meeting gather (Mac companion): the meeting runs in the Teams app, so the
 * area is silent for WorkAdventure, and the title of the meeting is shown on it while the meeting lasts.
 */
export const TeamsMeetingRoomPropertyData = PropertyBase.extend({
    type: z.literal("teamsMeetingRoomPropertyData"),
});

// DEPRECATED: the Gobeur mini-game was removed. This property (and its level) is kept only so that existing maps
// (e.g. the beta entry map) still parse; the front ignores it and the map editor no longer offers it.
export const GobeurLevel = z.enum(["beginner", "intermediate", "hard"]);

export const GobeurPropertyData = PropertyBase.extend({
    type: z.literal("gobeurPropertyData"),
    players: z.array(z.object({ uuid: z.string(), name: z.string() })).default([]),
    prisonAreaId: z.string().default(""),
    fallbackSafeAreaId: z.string().optional(),
    level: GobeurLevel.default("beginner"),
    durationSeconds: z.number().int().min(30).max(3600).default(180),
});

/** Size of the light of a lamp, in tiles. A lamp lights a square of this many tiles around itself by default. */
export const LAMP_LIGHT_DEFAULT_TILES = 12;
export const LAMP_LIGHT_MIN_TILES = 2;
export const LAMP_LIGHT_MAX_TILES = 60;

/**
 * Where the light of a lamp (an object whose catalog entry says `lamp`) stays: a rectangle of this size around it, kept
 * within the listening zone it stands in. Without this property the light fills its zone, or a square of 12 tiles
 * outside every zone.
 */
export const LampPropertyData = PropertyBase.extend({
    type: z.literal("lampPropertyData"),
    width: z.number().int().min(LAMP_LIGHT_MIN_TILES).max(LAMP_LIGHT_MAX_TILES).default(LAMP_LIGHT_DEFAULT_TILES),
    height: z.number().int().min(LAMP_LIGHT_MIN_TILES).max(LAMP_LIGHT_MAX_TILES).default(LAMP_LIGHT_DEFAULT_TILES),
});

/** An RGB lamp (an object whose catalog entry says `lamp.kind: "rgb"`): reach in tiles, opening and direction in degrees. */
export const RGB_LAMP_DEFAULT_COLOR = "#ffd9a0";
export const RGB_LAMP_DEFAULT_RADIUS_TILES = 6;
export const RGB_LAMP_MIN_RADIUS_TILES = 1;
export const RGB_LAMP_MAX_RADIUS_TILES = 20;
/** Degrees, clockwise on the screen from the east: 90 shines downwards. */
export const RGB_LAMP_DEFAULT_DIRECTION = 90;
export const RGB_LAMP_MIN_ANGLE = 10;
export const RGB_LAMP_MAX_ANGLE = 360;
/**
 * A turning lamp (a rotating beacon) goes round at this many turns a minute. At most 2 turns a second: its single beam
 * passes a still observer at most twice a second, under the 3 flashes a second of WCAG 2.3.1.
 */
export const RGB_LAMP_MIN_ROTATION_SPEED = 10;
export const RGB_LAMP_MAX_ROTATION_SPEED = 120;
export const RGB_LAMP_DEFAULT_ROTATION_SPEED = 30;
/** How strong the light of an RGB lamp is, as a share of its full light (1, the default). */
export const RGB_LAMP_MIN_INTENSITY = 0.1;
export const RGB_LAMP_MAX_INTENSITY = 1;

/**
 * The light of an RGB lamp: a cone of the colour `color`, `radius` tiles long, `angle` degrees wide (360: a full disc)
 * around `direction`. The walls and the tall objects (`castsShadow`) stop it. Without this property the lamp shines
 * with these defaults. Its own property, not `lampPropertyData`: that one is a rectangle in tiles (the zone of a music
 * lamp, the size of a dance floor) and stays as it is.
 */
export const RgbLampPropertyData = PropertyBase.extend({
    type: z.literal("rgbLampPropertyData"),
    color: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .default(RGB_LAMP_DEFAULT_COLOR),
    radius: z
        .number()
        .min(RGB_LAMP_MIN_RADIUS_TILES)
        .max(RGB_LAMP_MAX_RADIUS_TILES)
        .default(RGB_LAMP_DEFAULT_RADIUS_TILES),
    direction: z.number().min(0).lt(360).default(RGB_LAMP_DEFAULT_DIRECTION),
    angle: z.number().min(RGB_LAMP_MIN_ANGLE).max(RGB_LAMP_MAX_ANGLE).default(RGB_LAMP_MAX_ANGLE),
    // The lamp turns like a rotating beacon: `direction` is where its beam points at every whole turn of the clock
    // (see rgbLampBeamDirection in the front). All three are optional and fail open: a lamp saved without them, or
    // with a value that is not valid, stands still (or turns at the default speed, clockwise).
    rotation: z.boolean().optional().catch(undefined),
    /** Turns a minute. */
    rotationSpeed: z
        .number()
        .min(RGB_LAMP_MIN_ROTATION_SPEED)
        .max(RGB_LAMP_MAX_ROTATION_SPEED)
        .optional()
        .catch(undefined),
    /** Clockwise on the screen when absent. */
    rotationClockwise: z.boolean().optional().catch(undefined),
    // The share of its full light the lamp gives, on the map and through the night veil. Optional and failing open
    // like the rotation: a lamp saved without it, or with a value that is not valid, shines at full strength.
    intensity: z.number().min(RGB_LAMP_MIN_INTENSITY).max(RGB_LAMP_MAX_INTENSITY).optional().catch(undefined),
});

/**
 * The states an object of the map may have, kept by the server (never in the WAM): a lamp is `on` or not. A closed
 * list: a new kind of object that can be switched (a shutter that is `open`) adds its key here.
 */
export const ENTITY_STATE_KEYS = ["on"] as const;
/** A switch commands at most this many objects. */
export const SWITCH_MAX_TARGETS = 200;

/** Seconds after the last person left before a presence trigger lets go, by default. */
export const SWITCH_OFF_DELAY_DEFAULT_S = 30;
export const SWITCH_OFF_DELAY_MAX_S = 600;
/** How far a proximity trigger senses, in tiles, by default. */
export const SWITCH_PROXIMITY_DEFAULT_TILES = 3;
export const SWITCH_PROXIMITY_MAX_TILES = 20;
/** How wide a cone trigger senses, in degrees, by default. */
export const SWITCH_CONE_DEFAULT_ANGLE = 90;

const SwitchHour = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/**
 * What uses a switch without anybody touching it; the server decides (see SwitchTriggerEvaluator in the back).
 * - presence: somebody is in the room of the switch (`scope: "room"`, `areaId` found by the editor), in a chosen area
 *   (`scope: "area"`, `areaId`), within `tiles` of it on its floor (`scope: "proximity"`), or in a cone in front of
 *   it (`scope: "cone"`, like the beam of a lamp), or anywhere in the building it stands in (`scope: "building"`:
 *   the cells that are not outdoors and touch one another, walls included — only the browsers know them, so they
 *   report it). It lets go `offDelay` seconds after the last person left.
 * - hours: the time in Paris is between `from` (included) and `to` (excluded); the range may pass midnight.
 */
export const SwitchTrigger = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("presence"),
        scope: z.enum(["room", "area", "proximity", "cone", "building"]),
        areaId: z.string().optional(),
        tiles: z.number().int().min(1).max(SWITCH_PROXIMITY_MAX_TILES).default(SWITCH_PROXIMITY_DEFAULT_TILES),
        offDelay: z.number().int().min(0).max(SWITCH_OFF_DELAY_MAX_S).default(SWITCH_OFF_DELAY_DEFAULT_S),
        // The cone of `scope: "cone"`, like the light of an RGB lamp: degrees clockwise on the screen from the east
        // (90 points downwards), `angle` degrees wide, `tiles` long.
        direction: z.number().min(0).lt(360).default(RGB_LAMP_DEFAULT_DIRECTION),
        angle: z.number().min(RGB_LAMP_MIN_ANGLE).max(RGB_LAMP_MAX_ANGLE).default(SWITCH_CONE_DEFAULT_ANGLE),
    }),
    z.object({ type: z.literal("hours"), from: SwitchHour, to: SwitchHour }),
]);

/** The objects a switch commands: the ones listed, or the ones of the room it stands in. */
export const SwitchTargets = z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("ids"), ids: z.array(z.string()).max(SWITCH_MAX_TARGETS) }),
    z.object({ mode: z.literal("zone") }),
]);

/** The most a source gives or a sink takes, in litres a minute: 1000 cubic metres a second, a large river. */
export const MAX_WATER_FLOW = 60_000_000;
/** The largest radius a source pours over or a sink takes from, in tiles, and the radius of a sink that sets none. */
export const MAX_WATER_RADIUS_TILES = 10;
export const DEFAULT_SINK_RADIUS_TILES = 1.5;

/**
 * Where the water comes out of (or goes into) the object, from the corner of its image, in pixels: its foot, written
 * by the editor, which knows the size of the object (the server does not). Absent: the corner itself.
 */
const WaterAnchor = {
    anchorX: z.number().min(-4096).max(4096).optional(),
    anchorY: z.number().min(-4096).max(4096).optional(),
};

/**
 * A source of water: the object pours this many litres a minute into the hollow of the relief it stands in (or the
 * nearest one close by). The water itself is kept by the server (see Terrain/WaterBalance.ts).
 */
export const WaterSourcePropertyData = PropertyBase.extend({
    type: z.literal("waterSourcePropertyData"),
    flow: z.number().min(0).max(MAX_WATER_FLOW),
    /** The radius of the disc the water is poured over, in tiles: at the foot of the object when absent. */
    radius: z.number().min(0).max(MAX_WATER_RADIUS_TILES).optional(),
    ...WaterAnchor,
});

/** A sink: the object takes this many litres a minute out of the hollow it stands in, while there is water. */
export const WaterSinkPropertyData = PropertyBase.extend({
    type: z.literal("waterSinkPropertyData"),
    flow: z.number().min(0).max(MAX_WATER_FLOW),
    /** The radius of the disc the water is taken from, in tiles: DEFAULT_SINK_RADIUS_TILES when absent. */
    radius: z.number().min(0).max(MAX_WATER_RADIUS_TILES).optional(),
    ...WaterAnchor,
});

/**
 * A switch: activating the object sets the state `key` of its targets. The wiring is in the WAM; the state itself is
 * kept by the server (see EntityStates.ts). Several switches may command the same object: none has a position of
 * its own, the state belongs to the target.
 */
export const SwitchPropertyData = PropertyBase.extend({
    type: z.literal("switchPropertyData"),
    key: z.enum(ENTITY_STATE_KEYS).default("on"),
    targets: SwitchTargets.default({ mode: "zone" }),
    /** Only the users with one of these tags may use the switch; everybody when absent or empty. */
    allowedTags: z.array(z.string()).optional(),
    /** Used by hand when absent. Fail open: a trigger that is not valid leaves a manual switch. */
    trigger: SwitchTrigger.optional().catch(undefined),
    /**
     * The objects of its room, for a switch with a trigger that commands its room: the server, which does not know
     * what a lamp is, acts on these. Written and kept up to date by the map editor.
     */
    resolvedTargets: z.array(z.string()).max(SWITCH_MAX_TARGETS).optional().catch(undefined),
});

export const MatrixRoomPropertyData = PropertyBase.extend({
    type: z.literal("matrixRoomPropertyData"),
    shouldOpenAutomatically: z.boolean(),
    displayName: z.string(),
    serverData: z
        .object({
            matrixRoomId: z.string().optional(),
        })
        .optional(),
});

export const TooltipPropertyData = PropertyBase.extend({
    type: z.literal("tooltipPropertyData"),
    id: z.string(),
    content: z.string(),
    duration: z.number().optional().default(5000),
});

export const LivekitRoomPropertyData = PropertyBase.extend({
    type: z.literal("livekitRoomProperty"),
    roomName: z.string(),
    triggerMessage: z.string().optional(),
    livekitRoomConfig: LivekitRoomConfigData,
    livekitRoomAdminTag: z.string().optional(),
});

export const MaxUsersInAreaPropertyData = PropertyBase.extend({
    type: z.literal("maxUsersInAreaPropertyData"),
    /**
     * Max users in area:
     * - null | undefined: no limit
     * - 0: refuse access (zone always "full")
     * - 1+: maximum number of users allowed
     */
    maxUsers: z.number().min(0).nullable().optional(),
});

export const LockableAreaPropertyData = PropertyBase.extend({
    type: z.literal("lockableAreaPropertyData"),
    // Note: lock state is now stored in area property variables, not in the WAM
    allowedTags: z.array(z.string()).optional(),
});

export const ListeningZonePropertyData = PropertyBase.extend({
    type: z.literal("listeningZonePropertyData"),
    // Note: the Spotify Jam shared in the zone is stored in area property variables, not in the WAM
});

export const AreaDataProperty = z.discriminatedUnion("type", [
    StartPropertyData,
    ExitPropertyData,
    FocusablePropertyData,
    HighlightPropertyData,
    SilentPropertyData,
    JitsiRoomPropertyData,
    PlayAudioPropertyData,
    OpenWebsitePropertyData,
    OpenFilePropertyData,
    SpeakerMegaphonePropertyData,
    ListenerMegaphonePropertyData,
    AreaDescriptionPropertyData,
    RestrictedRightsPropertyData,
    PersonalAreaPropertyData,
    ExtensionModuleAreaProperty,
    MatrixRoomPropertyData,
    TooltipPropertyData,
    LivekitRoomPropertyData,
    MaxUsersInAreaPropertyData,
    LockableAreaPropertyData,
    ListeningZonePropertyData,
    TeamsMeetingRoomPropertyData,
]);

export const AreaDataProperties = z.array(AreaDataProperty);

export const AreaCoordinates = z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
});

export const AreaData = AreaCoordinates.extend({
    id: z.string(),
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    visible: z.boolean(),
    name: z.string(),
    properties: AreaDataProperties,
    /**
     * Altitude of the raised floor the area belongs to, in pixels above the ground; the ground when absent. Like an
     * entity (see EntityData.elevation), its rectangle is where it is drawn: over the ground `elevation` further
     * south. It only applies to the players of that floor.
     */
    elevation: z.number().int().min(0).optional(),
});

export const EntityDataProperty = z.discriminatedUnion("type", [
    JitsiRoomPropertyData,
    PlayAudioPropertyData,
    OpenWebsitePropertyData,
    OpenFilePropertyData,
    EntityDescriptionPropertyData,
    LivekitRoomPropertyData,
    GobeurPropertyData,
    LampPropertyData,
    RgbLampPropertyData,
    SwitchPropertyData,
    WaterSourcePropertyData,
    WaterSinkPropertyData,
]);

export const EntityDataProperties = z.array(EntityDataProperty);

export const CollisionGrid = z.array(z.array(z.number()));

/**
 * Solid rectangle in pixels, relative to the top-left corner of an entity. Opt-in alternative to the
 * 32px `collisionGrid` for thin walls; it only affects the player movement, not the editor placement grid.
 */
export const CollisionRectangle = z.object({
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
});

export const EntityLayer = z.enum(["floor", "standing", "overhead"]);
export type EntityLayer = z.infer<typeof EntityLayer>;

export const MAX_ENTITY_ANIMATION_FRAME_COUNT = 64;
export const MAX_ENTITY_ANIMATION_FRAME_RATE = 60;

/**
 * An animated image is a horizontal strip of `frameCount` frames of the same width, played in a loop. Every size of
 * the entity (placement, collision grid, depth) is the size of one frame.
 */
export const EntityAnimation = z.object({
    frameCount: z.number().int().min(2).max(MAX_ENTITY_ANIMATION_FRAME_COUNT),
    frameRate: z.number().positive().max(MAX_ENTITY_ANIMATION_FRAME_RATE),
});

export enum Season {
    Spring = "spring",
    Summer = "summer",
    Autumn = "autumn",
    Winter = "winter",
}

/** Seasonal images share the same canvas and trunk anchor; paths are relative to the catalog. */
export const EntitySeasonalImages = z.object({
    spring: z.string().min(1),
    summer: z.string().min(1),
    autumn: z.string().min(1),
    winter: z.string().min(1),
});

export const EntityRawPrefab = z.object({
    id: z.string(),
    name: z.string(),
    tags: z.array(z.string()),
    imagePath: z.string(),
    direction: z.enum(["Left", "Up", "Down", "Right"]),
    color: z.string(),
    collisionGrid: CollisionGrid.optional(),
    // Fail open: an invalid rectangle list is ignored instead of rejecting the whole catalog file,
    // which would make every placed entity of the catalog lose its prefab.
    collisionRectangles: z.array(CollisionRectangle).optional().catch(undefined),
    depthOffset: z.number().optional(),
    /**
     * Where the object is drawn relative to the players: `floor` always under them (a rug, a pool), `standing`
     * sorted with them by the foot of the image (the default, also when absent), `overhead` always over them (a
     * lamp hanging from the ceiling, a tree top). Fail open like `collisionRectangles`.
     */
    layer: EntityLayer.optional().catch(undefined),
    /**
     * Water of the object (a pool), as rectangles in pixels relative to the top-left corner like
     * `collisionRectangles`. Players cannot walk into it: they dive in with the interaction key, swim, and get out
     * by walking onto the edge. Companions and wandering animals never enter it. Fail open like
     * `collisionRectangles`.
     */
    water: z.array(CollisionRectangle).optional().catch(undefined),
    /**
     * For an uploaded image that is another view (back, left, right) of an object of the library: the id of that
     * object. The views of an object are offered together and a placed copy can be turned from one to another.
     */
    variantOf: z.string().optional().catch(undefined),
    /**
     * Whether players sit on the object by walking onto it. Unset: deduced from its category or name (chair, couch…).
     * Fail open like `collisionRectangles`.
     */
    sittable: z.boolean().optional().catch(undefined),
    // Fail open like `collisionRectangles`: an invalid animation shows the image as a still one.
    animation: EntityAnimation.optional().catch(undefined),
    seasonal: EntitySeasonalImages.optional().catch(undefined),
    /**
     * Places of the entity a player can sit on (e.g. two for a couch), as the position of the sitter's feet in
     * tiles from the top-left corner of the image. The player sits facing `direction`. Fail open like
     * `collisionRectangles`.
     */
    seat: z
        .array(z.object({ x: z.number().nonnegative(), y: z.number().nonnegative() }))
        .optional()
        .catch(undefined),
    /**
     * Sound of a step on this entity (a floor tile, a rug): players walking over it play the recordings of this
     * surface. Fail open like `collisionRectangles`: an unknown value is ignored.
     */
    footstepSound: z.enum(["grass", "wood", "carpet", "stone"]).optional().catch(undefined),
    /**
     * When set, the entity is replaced in game by a sprite that walks around (e.g. a duck). `sheetPath` is the
     * spritesheet, relative to the catalog file. The WAM format is unchanged: this lives in the catalog only.
     * Fail open like `seat`: an invalid value shows the entity as a plain image.
     */
    wander: z.object({ sheetPath: z.string() }).optional().catch(undefined),
    /**
     * When set, the entity is a lamp: a light that follows the music of a Jam wherever the entity is moved (a spot, a
     * mirror ball, a neon, a strobe). `anchor` is the point the light comes from, in pixels from the top-left corner of
     * the image (the centre of the image when absent). A `dancefloor` is a floor of tiles that light up in patterns,
     * with or without music, over the size set for it in the editor (`lampPropertyData`), from its top-left corner.
     * An `rgb` lamp is a steady light of a chosen colour, stopped by the walls and the tall objects, set in the editor
     * (`rgbLampPropertyData`); it does not follow the music.
     * The WAM format is unchanged: this lives in the catalog only.
     * Fail open like `wander`: an invalid value shows the entity as a plain image.
     */
    lamp: z
        .object({
            kind: z.enum(["spot", "disco", "neon", "strobe", "dancefloor", "rgb"]),
            anchor: z.object({ x: z.number(), y: z.number() }).optional().catch(undefined),
        })
        .optional()
        .catch(undefined),
    /**
     * A tall object (a cupboard, a partition): it stops the light of the RGB lamps and casts a shadow, over its
     * `collisionRectangles`, else the blocking cells of its `collisionGrid`. A low object (a table) lets the light
     * pass. Fail open like `collisionRectangles`.
     */
    castsShadow: z.boolean().optional().catch(undefined),
    /**
     * A switch ready to use: placed from the catalog, the object is given a `switchPropertyData` that commands the
     * lamps of its room (any other object can be made a switch in the editor): used by hand (`true`), a presence
     * sensor (`"presence"`) or a timer (`"hours"`). Fail open like `castsShadow`.
     */
    switch: z
        .union([z.boolean(), z.enum(["presence", "hours"])])
        .optional()
        .catch(undefined),
    /**
     * A source or a sink of water ready to use (a fountain, a chasm): placed from the catalog, the object is given a
     * `waterSourcePropertyData` or a `waterSinkPropertyData` of this flow, in cubic metres an hour. `anchor` is where
     * its water comes out or goes, in pixels from the top-left corner of the image (the middle of its foot when
     * absent). Any other object can be made a source or a sink in the editor. Fail open like `castsShadow`.
     */
    waterFlow: z
        .object({
            kind: z.enum(["source", "sink"]),
            flow: z.number().min(0),
            /** The radius the object starts with, in tiles (see the water properties). */
            radius: z.number().min(0).optional().catch(undefined),
            anchor: z.object({ x: z.number(), y: z.number() }).optional().catch(undefined),
        })
        .optional()
        .catch(undefined),
    // UUID of the user who uploaded this custom entity. Stamped by map-storage from the
    // authenticated user UUID, never from the client. Undefined on the built-in ("Default")
    // collections and on custom entities uploaded before this field existed: those can only be
    // modified or deleted by a user with map edit rights.
    ownerId: z.string().optional(),
});

export const EntityPrefabType = z.union([z.literal("Default"), z.literal("Custom")]);

export const EntityPrefab = EntityRawPrefab.extend({
    collectionName: z.string(),
    type: EntityPrefabType,
});

export const EntityPrefabRef = z.object({
    collectionName: z.string(),
    id: z.string(),
});

export const EntityCollection = z.object({
    collectionName: z.string(),
    tags: z.array(z.string()),
    collection: z.array(EntityPrefab),
});

export const EntityCollectionRaw = z.object({
    collectionName: z.string(),
    tags: z.array(z.string()),
    collection: z.array(EntityRawPrefab),
    version: z.string().optional(),
});

// TODO: get rid of this type and use only WAMEntityData
export const EntityData = z.object({
    id: z.string(),
    x: z.number(),
    y: z.number(),
    name: z.string().optional(),
    properties: EntityDataProperties.optional(),
    /**
     * Manual stacking against the objects the entity overlaps: +1 draws it over the next one it overlaps, -1 under the
     * previous one. Absent or 0 keeps the automatic order, which follows the position of the foot.
     */
    depthStep: z.number().int().optional(),
    /**
     * Altitude of the floor the entity stands on, in pixels above the ground of the map: absent or 0 on the ground. The
     * position (x, y) stays the one of the image, which is drawn that much further north than the place the entity
     * stands on: that place, on the ground, is (x, y + elevation).
     */
    elevation: z.number().int().min(0).optional(),
    prefab: EntityRawPrefab,
    prefabRef: EntityPrefabRef,
});

export const EntityDimensions = z.object({
    width: z.number(),
    height: z.number(),
});

export const EntityCoordinates = z.object({
    x: z.number(),
    y: z.number(),
});

export const WAMEntityData = EntityData.omit({ prefab: true, id: true });
export type WAMEntityData = z.infer<typeof WAMEntityData>;

export const WAMMetadata = z.object({
    name: z.string().optional().nullable().describe("The name of the map."),
    description: z
        .string()
        .optional()
        .nullable()
        .describe("A description of the map. Can be used in social networks when sharing a link to the map."),
    copyright: z
        .string()
        .optional()
        .nullable()
        .describe(
            "Copyright notice for this map. Can be a link to a license. Parts of this map like tilesets or images can have their own copyright.",
        ),
    thumbnail: z
        .string()
        .optional()
        .nullable()
        .describe(
            "URL to a thumbnail image. This image will be used in social networks when sharing a link to the map.",
        ),
    areasSearchable: z
        .number()
        .optional()
        .nullable()
        .describe("Number of areas define as searchable by the map editor for the exploration mode."),
    entitiesSearchable: z
        .number()
        .optional()
        .nullable()
        .describe("Number of entities define as searchable by the map editor for the exploration mode."),
});
export type WAMMetadata = z.infer<typeof WAMMetadata>;

export const WAMVendor = z
    .unknown()
    .describe(
        "Use this field to store data that is not handled directly by WorkAdventure. " +
            "This is a good place to store data generated by an admin (like access rights)",
    );

export const MegaphoneRecordingSettings = z.object({
    enabled: z.boolean(),
    rights: z.array(z.string()).optional(),
});

export const MegaphoneSettings = z.object({
    enabled: z.boolean(),
    title: z.string().optional(),
    scope: z.string().optional(),
    rights: z.array(z.string()).optional(),
    audienceVideoFeedbackActivated: z.boolean().optional(),
    notificationSoundUrl: z.string().optional(),
    enableSoundNotifications: z.boolean().optional(),
    recording: MegaphoneRecordingSettings.optional(),
});

export type MegaphoneRecordingSettings = z.infer<typeof MegaphoneRecordingSettings>;
export type MegaphoneSettings = z.infer<typeof MegaphoneSettings>;

export const RecordingSettings = z.object({
    rights: z.array(z.string()).optional(),
    enableSounds: z.boolean().optional(),
});

/**
 * How a map adjusts an object of the library for itself: display level, collisions and water. It replaces these
 * fields of the prefab for every copy placed on this map, so that objects of the built-in collections (read-only
 * catalog files) can be fixed too.
 */
export const PrefabOverride = z.object({
    layer: EntityLayer.optional(),
    depthOffset: z.number().optional(),
    collisionGrid: CollisionGrid.optional(),
    collisionRectangles: z.array(CollisionRectangle).optional(),
    water: z.array(CollisionRectangle).optional(),
    sittable: z.boolean().optional(),
    /** Category of the object in the library of this map, put first in its tags. */
    category: z.string().trim().min(1).max(60).optional(),
});
export type PrefabOverride = z.infer<typeof PrefabOverride>;

/** What players do with the objects of a category: nothing, sit on them, swim in their water, skate on their ice. */
export const ObjectInteraction = z.enum([
    "none",
    "sit",
    "swim",
    "dance",
    "coffee",
    "sleep",
    "toilet",
    "run",
    "iceSkate",
]);
export type ObjectInteraction = z.infer<typeof ObjectInteraction>;
/** `auto`: on touching the object; `key`: the interaction key (space) when next to it. */
export const InteractionTrigger = z.enum(["auto", "key"]);
export type InteractionTrigger = z.infer<typeof InteractionTrigger>;

/** Settings of a category of objects on a map: its interaction and the default display level of its objects. */
export const CategorySettings = z.object({
    interaction: ObjectInteraction,
    trigger: InteractionTrigger,
    layer: EntityLayer.optional(),
});
export type CategorySettings = z.infer<typeof CategorySettings>;

export enum WeatherType {
    Automatic = "automatic",
    Clear = "clear",
    /** A clear sky with passing clouds (fixed choice): drawn as Clear with clouds, never a bad weather. */
    Cloudy = "cloudy",
    Fog = "fog",
    /** The weather at the place of the map (Paris by default), from Open-Meteo through the pusher (else Automatic). */
    Real = "real",
    Rain = "rain",
    Snow = "snow",
    Storm = "storm",
}
export const Weather = z.nativeEnum(WeatherType);

export const AutoWeatherFrequency = z.enum(["calm", "normal", "stormy"]);
export type AutoWeatherFrequency = z.infer<typeof AutoWeatherFrequency>;

/** Settings of the automatic weather: how often it changes, which weathers it may pick, and clouds on clear slots. */
export const AutoWeather = z.object({
    frequency: AutoWeatherFrequency,
    include: z.array(Weather),
    /** Clouds over some clear slots; absent means yes (maps saved before clouds existed have them). */
    clouds: z.boolean().optional(),
});
export type AutoWeatherSettings = z.infer<typeof AutoWeather>;

export const DEFAULT_AUTO_WEATHER: AutoWeatherSettings = {
    frequency: "normal",
    include: [WeatherType.Rain, WeatherType.Snow, WeatherType.Storm, WeatherType.Fog],
};

/** Where the map is: its real weather and its day/night follow this place (Paris when absent). */
/** Whether this is a time zone the clock knows (an IANA name, like "Europe/Paris"). */
export function isTimeZone(timeZone: string): boolean {
    if (timeZone === "") {
        return false;
    }
    try {
        new Intl.DateTimeFormat("en-GB", { timeZone });
        return true;
    } catch {
        return false;
    }
}

export const WeatherLocation = z.object({
    name: z.string().trim().min(1).max(200),
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    /**
     * The time zone of the place (IANA name): the clock shown and the timers of the map follow it. Absent for a
     * place chosen before it was kept, or when it is not a time zone: the time of Paris then (fail open).
     */
    timezone: z.string().max(64).refine(isTimeZone).optional().catch(undefined),
});
export type WeatherLocation = z.infer<typeof WeatherLocation>;

/** Side of a tile, in map pixels and in pixels of altitude. */
export const TILE_PX = 32;
/** Side of a cell of the relief, in map pixels: half a tile. */
export const TERRAIN_CELL = 16;
/** Cells along the side of a chunk of the relief: the relief is stored by chunks, only where it was dug. */
export const TERRAIN_CHUNK = 16;
/** The lowest height a cell can have, in pixels of altitude: 8 tiles under the ground. */
export const TERRAIN_MIN_HEIGHT = -256;
/** The largest number a soil is kept as in a map (see Terrain/Soils.ts). */
export const TERRAIN_MAX_SOIL = 6;
/** The highest height a cell can have, in pixels of altitude: 8 tiles over the ground. */
export const TERRAIN_MAX_HEIGHT = 256;
/**
 * How deep the relief of a map may be dug, and how high it may be raised over the ground, in tiles: set for each
 * map, within these bounds.
 */
export const DEFAULT_MAX_DEPTH_TILES = 2;
export const MAX_DEPTH_TILES = 8;

/**
 * The relief of the ground of a map: a height for each cell (TERRAIN_CELL map pixels wide), 0 on the ground,
 * negative where it was dug and positive where it was raised, by chunks of TERRAIN_CHUNK × TERRAIN_CHUNK cells keyed "chunkX,chunkY" (row by row).
 */
export const TerrainData = z.object({
    chunks: z.record(
        z.string().regex(/^-?\d{1,6},-?\d{1,6}$/),
        z.array(z.number().int().min(TERRAIN_MIN_HEIGHT).max(TERRAIN_MAX_HEIGHT)).length(TERRAIN_CHUNK * TERRAIN_CHUNK),
    ),
    maxDepthTiles: z.number().int().min(1).max(MAX_DEPTH_TILES).optional(),
    /**
     * The soil of the cells that were painted (see Terrain/Soils.ts), by the same chunks as the heights: 0 for a cell
     * not painted. Absent from a map where no soil was painted.
     */
    soil: z
        .record(
            z.string().regex(/^-?\d{1,6},-?\d{1,6}$/),
            z.array(z.number().int().min(0).max(TERRAIN_MAX_SOIL)).length(TERRAIN_CHUNK * TERRAIN_CHUNK),
        )
        .optional()
        .catch(undefined),
});
export type TerrainData = z.infer<typeof TerrainData>;

/** How fast the water of the relief comes and goes on a map. */
export const DEFAULT_WATER_SETTINGS = { runoff: 10, evaporation: 0.2, speed: 60, absorption: 5, current: 1 } as const;
/** The strongest current a map may set: twice the usual one. */
export const MAX_WATER_CURRENT = 2;
export const MAX_WATER_SPEED = 1000;
export const WaterSettings = z.object({
    /** Ground around a hollow whose rain runs into it, in times the surface of the hollow. */
    runoff: z.number().min(0).max(100).default(DEFAULT_WATER_SETTINGS.runoff),
    /** Water lost by a wet surface in dry weather, in mm an hour. */
    evaporation: z.number().min(0).max(10).default(DEFAULT_WATER_SETTINGS.evaporation),
    /**
     * How many times faster than in reality the water of the map goes (1: as in reality, where a rain fills a lake
     * in hours; 60 by default: a minute for an hour).
     */
    speed: z.number().min(1).max(MAX_WATER_SPEED).default(DEFAULT_WATER_SETTINGS.speed),
    /** Water the flat ground drinks from the sheet of a flood, in mm an hour: how fast a flood goes down. */
    absorption: z.number().min(0).max(100).default(DEFAULT_WATER_SETTINGS.absorption),
    /**
     * How hard the current of the water carries the avatars: 0 not at all, 1 as fast as one walks where it is
     * hardest, up to twice that.
     */
    current: z.number().min(0).max(MAX_WATER_CURRENT).default(DEFAULT_WATER_SETTINGS.current),
});
export type WaterSettings = z.infer<typeof WaterSettings>;

/**
 * The life in the water of the relief of a map (fish that breed, dolphins that hunt them), kept by the server, and
 * how often the land animals come to drink it (computed by each browser). All durations are in real seconds: the
 * speed of the water does not hasten them.
 */
export const DEFAULT_LIFE_SETTINGS = {
    enabled: false,
    reproductionDelay: 120,
    maxLifespan: 900,
    maxSpeed: 1.5,
    huntInterval: 60,
    dolphinReproductionDelay: 300,
    dolphinMaxLifespan: 3600,
    drinkInterval: 120,
} as const;
export const LIFE_BOUNDS = {
    reproductionDelay: [10, 3600],
    maxLifespan: [30, 86400],
    maxSpeed: [0.2, 6],
    huntInterval: [5, 3600],
    dolphinReproductionDelay: [30, 7200],
    dolphinMaxLifespan: [60, 172800],
    drinkInterval: [20, 3600],
} as const;
/**
 * The life on the land of a map (antelopes that breed, lions and tigers that hunt them and the fish of the shallow
 * water), kept by the server. Absent from a map saved before it existed: off, with these values.
 */
export const DEFAULT_LAND_LIFE_SETTINGS = {
    landEnabled: false,
    antelopeReproductionDelay: 120,
    antelopeMaxLifespan: 900,
    landHuntInterval: 60,
    landPredatorReproductionDelay: 300,
    landPredatorMaxLifespan: 3600,
} as const;
export const LAND_LIFE_BOUNDS = {
    antelopeReproductionDelay: [10, 3600],
    antelopeMaxLifespan: [30, 86400],
    landHuntInterval: [5, 3600],
    landPredatorReproductionDelay: [30, 7200],
    landPredatorMaxLifespan: [60, 172800],
} as const;
/**
 * The gulls of a map (they fish in its water, land on its shores), kept by the server. Absent from a map saved
 * before they existed: off, with these values. They need the life of the water (`enabled`).
 */
export const DEFAULT_AIR_LIFE_SETTINGS = {
    gullsEnabled: false,
    gullHuntInterval: 45,
    gullReproductionDelay: 300,
    gullMaxLifespan: 1800,
} as const;
export const AIR_LIFE_BOUNDS = {
    gullHuntInterval: [5, 3600],
    gullReproductionDelay: [30, 7200],
    gullMaxLifespan: [60, 172800],
} as const;
const airDuration = (key: keyof typeof AIR_LIFE_BOUNDS) =>
    z.number().min(AIR_LIFE_BOUNDS[key][0]).max(AIR_LIFE_BOUNDS[key][1]).optional().catch(undefined);
const landDuration = (key: keyof typeof LAND_LIFE_BOUNDS) =>
    z.number().min(LAND_LIFE_BOUNDS[key][0]).max(LAND_LIFE_BOUNDS[key][1]).optional().catch(undefined);
export const LifeSettings = z.object({
    enabled: z.boolean().default(DEFAULT_LIFE_SETTINGS.enabled),
    /** How long a fish waits between two matings, and a newborn before its first, in seconds. */
    reproductionDelay: z
        .number()
        .min(LIFE_BOUNDS.reproductionDelay[0])
        .max(LIFE_BOUNDS.reproductionDelay[1])
        .default(DEFAULT_LIFE_SETTINGS.reproductionDelay),
    /** The longest life of a fish, in seconds (each lives 70 % to 100 % of it). */
    maxLifespan: z
        .number()
        .min(LIFE_BOUNDS.maxLifespan[0])
        .max(LIFE_BOUNDS.maxLifespan[1])
        .default(DEFAULT_LIFE_SETTINGS.maxLifespan),
    /** The fastest a fish swims, in tiles (32 map pixels) a second. */
    maxSpeed: z
        .number()
        .min(LIFE_BOUNDS.maxSpeed[0])
        .max(LIFE_BOUNDS.maxSpeed[1])
        .default(DEFAULT_LIFE_SETTINGS.maxSpeed),
    /** How long a dolphin waits between two hunts, in seconds. */
    huntInterval: z
        .number()
        .min(LIFE_BOUNDS.huntInterval[0])
        .max(LIFE_BOUNDS.huntInterval[1])
        .default(DEFAULT_LIFE_SETTINGS.huntInterval),
    /** How long a dolphin waits between two calves, and a calf before its first, in seconds. */
    dolphinReproductionDelay: z
        .number()
        .min(LIFE_BOUNDS.dolphinReproductionDelay[0])
        .max(LIFE_BOUNDS.dolphinReproductionDelay[1])
        .default(DEFAULT_LIFE_SETTINGS.dolphinReproductionDelay),
    /** The longest life of a dolphin, in seconds (each lives 70 % to 100 % of it). */
    dolphinMaxLifespan: z
        .number()
        .min(LIFE_BOUNDS.dolphinMaxLifespan[0])
        .max(LIFE_BOUNDS.dolphinMaxLifespan[1])
        .default(DEFAULT_LIFE_SETTINGS.dolphinMaxLifespan),
    /**
     * How long a land animal (the wandering ones) waits between two drinks at the water of the relief, in seconds.
     * It applies whether the life of the water is on or not.
     */
    drinkInterval: z
        .number()
        .min(LIFE_BOUNDS.drinkInterval[0])
        .max(LIFE_BOUNDS.drinkInterval[1])
        .default(DEFAULT_LIFE_SETTINGS.drinkInterval),
    /** Whether antelopes, lions and tigers live on the outdoor land of the map (independent of `enabled`). */
    landEnabled: z.boolean().optional().catch(undefined),
    /** How long an antelope waits between two matings, and its longest life, in seconds. */
    antelopeReproductionDelay: landDuration("antelopeReproductionDelay"),
    antelopeMaxLifespan: landDuration("antelopeMaxLifespan"),
    /** The lions and the tigers: between two hunts, between two young, and their longest life, in seconds. */
    landHuntInterval: landDuration("landHuntInterval"),
    landPredatorReproductionDelay: landDuration("landPredatorReproductionDelay"),
    landPredatorMaxLifespan: landDuration("landPredatorMaxLifespan"),
    /** Whether gulls fish in the water of the map (they need `enabled`). */
    gullsEnabled: z.boolean().optional().catch(undefined),
    /** The gulls: between two hunts, between two broods, and their longest life, in seconds. */
    gullHuntInterval: airDuration("gullHuntInterval"),
    gullReproductionDelay: airDuration("gullReproductionDelay"),
    gullMaxLifespan: airDuration("gullMaxLifespan"),
});
export type LifeSettings = z.infer<typeof LifeSettings>;

/**
 * The last snow of the map once another weather took its place: its ground melts from `endedAt`. Without `startedAt`,
 * a snow from before its start was kept: its ground was full.
 */
export const LastSnow = z.object({
    startedAt: z.number().finite().nonnegative().optional(),
    endedAt: z.number().finite().nonnegative(),
});
export type LastSnow = z.infer<typeof LastSnow>;

export const WAMSettings = z.object({
    weather: Weather.optional().catch(undefined),
    weatherStartedAt: z.number().finite().nonnegative().optional().catch(undefined),
    lastSnow: LastSnow.optional().catch(undefined),
    weatherAuto: AutoWeather.optional().catch(undefined),
    weatherLocation: WeatherLocation.optional().catch(undefined),
    megaphone: MegaphoneSettings.optional(),
    recording: RecordingSettings.optional(),
    /** Per prefab id. Fail open: a broken entry must not make the whole map unreadable. */
    prefabOverrides: z.record(z.string(), PrefabOverride).optional().catch(undefined),
    /** Per category, by its name in lower case. Fail open like `prefabOverrides`. */
    categories: z.record(z.string(), CategorySettings).optional().catch(undefined),
    water: WaterSettings.optional().catch(undefined),
    life: LifeSettings.optional().catch(undefined),
});

export const WAMFileFormat = z.object({
    version: z.string(),
    mapUrl: z.string(),
    entities: z.record(z.string(), WAMEntityData),
    areas: z.array(AreaData),
    entityCollections: z.array(CollectionUrl),
    lastCommandId: z.string().optional(),
    settings: WAMSettings.optional(),
    metadata: WAMMetadata.optional().describe("Contains metadata about the map (name, description, copyright, etc.)"),
    vendor: WAMVendor.optional(),
    /** Fail open: a broken relief must not make the whole map unreadable. */
    terrain: TerrainData.optional().catch(undefined),
});

export const MapsCacheSingleMapFormat = z.object({
    mapUrl: z.string(),
    metadata: WAMMetadata.optional(),
    vendor: WAMVendor.optional(),
});
export const MapsCacheFileFormat = z.object({
    version: z.string(),
    maps: z
        .record(z.string(), MapsCacheSingleMapFormat)
        .describe("The format of the output of the /maps API call on the map-storage container."),
});

export type EntityRawPrefab = z.infer<typeof EntityRawPrefab>;
export type EntityPrefab = z.infer<typeof EntityPrefab>;
export type EntityPrefabType = z.infer<typeof EntityPrefabType>;
export type EntityCollection = z.infer<typeof EntityCollection>;
export type EntityCollectionRaw = z.infer<typeof EntityCollectionRaw>;
export type CollectionUrl = z.infer<typeof CollectionUrl>;
export type CollisionGrid = z.infer<typeof CollisionGrid>;
export type CollisionRectangle = z.infer<typeof CollisionRectangle>;
export type EntityAnimation = z.infer<typeof EntityAnimation>;
export type EntityData = z.infer<typeof EntityData>;
export type EntityDimensions = z.infer<typeof EntityDimensions>;
export type EntityCoordinates = z.infer<typeof EntityCoordinates>;
export type EntityDataProperties = z.infer<typeof EntityDataProperties>;
export type EntityDataProperty = z.infer<typeof EntityDataProperty>;
export type EntityDataPropertiesKeys =
    | "jitsiRoomProperty"
    | "playAudio"
    | "openWebsite"
    | "openFile"
    | "livekitRoomProperty"
    | "lampPropertyData"
    | "switchPropertyData"
    | "waterSourcePropertyData"
    | "waterSinkPropertyData";
export type AreaCoordinates = z.infer<typeof AreaCoordinates>;
export type AreaData = z.infer<typeof AreaData>;
export type AreaDataProperties = z.infer<typeof AreaDataProperties>;
export type AreaDataProperty = z.infer<typeof AreaDataProperty>;
export type AreaDataPropertiesKeys = AreaDataProperty["type"];
export type ActionsMenuData = z.infer<typeof PropertyBase>;
export type ExitPropertyData = z.infer<typeof ExitPropertyData>;
export type StartPropertyData = z.infer<typeof StartPropertyData>;
export type SilentPropertyData = z.infer<typeof SilentPropertyData>;
export type FocusablePropertyData = z.infer<typeof FocusablePropertyData>;
export type HighlightPropertyData = z.infer<typeof HighlightPropertyData>;
export type JitsiRoomConfigData = z.infer<typeof JitsiRoomConfigData>;
export type LivekitRoomConfigData = z.infer<typeof LivekitRoomConfigData>;
export type JitsiRoomPropertyData = z.infer<typeof JitsiRoomPropertyData>;
export type LivekitRoomPropertyData = z.infer<typeof LivekitRoomPropertyData>;
export type PlayAudioPropertyData = z.infer<typeof PlayAudioPropertyData>;
export type OpenWebsitePropertyData = z.infer<typeof OpenWebsitePropertyData>;
export type OpenFilePropertyData = z.infer<typeof OpenFilePropertyData>;
export type WAMSettings = z.infer<typeof WAMSettings>;
export type WAMFileFormat = z.infer<typeof WAMFileFormat>;
export type MapsCacheSingleMapFormat = z.infer<typeof MapsCacheSingleMapFormat>;
export type MapsCacheFileFormat = z.infer<typeof MapsCacheFileFormat>;
export type SpeakerMegaphonePropertyData = z.infer<typeof SpeakerMegaphonePropertyData>;
export type ListenerMegaphonePropertyData = z.infer<typeof ListenerMegaphonePropertyData>;
export type EntityDescriptionPropertyData = z.infer<typeof EntityDescriptionPropertyData>;
export type AreaDescriptionPropertyData = z.infer<typeof AreaDescriptionPropertyData>;
export type RestrictedRightsPropertyData = z.infer<typeof RestrictedRightsPropertyData>;
export type PersonalAreaPropertyData = z.infer<typeof PersonalAreaPropertyData>;
export type TeamsMeetingRoomPropertyData = z.infer<typeof TeamsMeetingRoomPropertyData>;
export type RecordingSettings = z.infer<typeof RecordingSettings>;
export type GobeurLevel = z.infer<typeof GobeurLevel>;
export type GobeurPropertyData = z.infer<typeof GobeurPropertyData>;
export type LampPropertyData = z.infer<typeof LampPropertyData>;
export type RgbLampPropertyData = z.infer<typeof RgbLampPropertyData>;
export type SwitchTargets = z.infer<typeof SwitchTargets>;
export type SwitchTrigger = z.infer<typeof SwitchTrigger>;
export type SwitchPropertyData = z.infer<typeof SwitchPropertyData>;
export type WaterSourcePropertyData = z.infer<typeof WaterSourcePropertyData>;
export type WaterSinkPropertyData = z.infer<typeof WaterSinkPropertyData>;
export type MatrixRoomPropertyData = z.infer<typeof MatrixRoomPropertyData>;
export type PersonalAreaAccessClaimMode = z.infer<typeof PersonalAreaAccessClaimMode>;
export type ExtensionModuleAreaPropertyData = z.infer<typeof ExtensionModuleAreaProperty>;
export type TooltipPropertyData = z.infer<typeof TooltipPropertyData>;
export type MaxUsersInAreaPropertyData = z.infer<typeof MaxUsersInAreaPropertyData>;
export type LockableAreaPropertyData = z.infer<typeof LockableAreaPropertyData>;
export type ListeningZonePropertyData = z.infer<typeof ListeningZonePropertyData>;

export enum GameMapProperties {
    ALLOW_API = "allowApi",
    AUDIO_LOOP = "audioLoop",
    AUDIO_VOLUME = "audioVolume",
    BBB_MEETING = "bbbMeeting",
    COLLIDES = "collides",
    DEFAULT = "default",
    EXIT_URL = "exitUrl",
    EXIT_SCENE_URL = "exitSceneUrl",
    FONT_FAMILY = "font-family",
    FOCUSABLE = "focusable",
    JITSI_ADMIN_ROOM_TAG = "jitsiRoomAdminTag",
    JITSI_CONFIG = "jitsiConfig",
    JITSI_INTERFACE_CONFIG = "jitsiInterfaceConfig",
    JITSI_ROOM = "jitsiRoom",
    JITSI_TRIGGER = "jitsiTrigger",
    JITSI_TRIGGER_MESSAGE = "jitsiTriggerMessage",
    JITSI_URL = "jitsiUrl",
    JITSI_WIDTH = "jitsiWidth",
    JITSI_NO_PREFIX = "jitsiNoPrefix",
    JITSI_CLOSABLE = "jitsiClosable",
    LISTENER_MEGAPHONE = "listenerMegaphone",
    NAME = "name",
    OPEN_TAB = "openTab",
    OPEN_WEBSITE = "openWebsite",
    OPEN_WEBSITE_ALLOW_API = "openWebsiteAllowApi",
    OPEN_WEBSITE_POLICY = "openWebsitePolicy",
    OPEN_WEBSITE_WIDTH = "openWebsiteWidth",
    OPEN_WEBSITE_POSITION = "openWebsitePosition",
    OPEN_WEBSITE_CLOSABLE = "openWebsiteClosable",
    OPEN_WEBSITE_TRIGGER = "openWebsiteTrigger",
    OPEN_WEBSITE_TRIGGER_MESSAGE = "openWebsiteTriggerMessage",
    OPEN_WEBSITE_HIDE_URL = "openWebsiteHideUrl",
    PLAY_AUDIO = "playAudio",
    PLAY_AUDIO_LOOP = "playAudioLoop",
    POLICY = "policy",
    READABLE_BY = "readableBy",
    SCRIPT = "script",
    SCRIPT_DISABLE_MODULE_SUPPORT = "scriptDisableModuleSupport",
    SILENT = "silent",
    SPEAKER_MEGAPHONE = "speakerMegaphone",
    START = "start",
    START_LAYER = "startLayer",
    URL = "url",
    WRITABLE_BY = "writableBy",
    ZONE = "zone",
    ZOOM_MARGIN = "zoomMargin",
}

export const mapCustomEntityDirectionToDirection = (uploadEntityMessageDirection: CustomEntityDirection) => {
    switch (uploadEntityMessageDirection) {
        case CustomEntityDirection.Up:
            return Direction.Up;
        case CustomEntityDirection.Right:
            return Direction.Right;
        case CustomEntityDirection.Down:
            return Direction.Down;
        case CustomEntityDirection.Left:
            return Direction.Left;
        default:
            return Direction.Down;
    }
};
