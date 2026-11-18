import type { Unsubscriber } from "svelte/store";
import { rgbLampLightsStore, rgbLampPreviewStore, type RgbLampLight } from "../../../Stores/RgbLampStore";
import type { Entity } from "../../ECS/Entity";
import type { GameScene } from "../GameScene";
import { MAP_LAYER_TILE_SIZE } from "../MapEditor/MapLayer/MapLayerCatalog";
import { ServerNightClock } from "../Night/ServerNightClock";
import { lampSource } from "./LampReconcile";
import { LightObstaclesByLevel } from "./LightObstacleReader";
import { bounceSources, secondBounceSources } from "./LightBounce";
import { lightBounceStrengthNow, lightSecondBounceNow, lightSoftEdgeVersion } from "./LightSoftEdge";
import type { LightObstacleReader } from "./LightObstacleReader";
import { coneOfLitPolygon, litPolygon, type LightCone, type Point } from "./RgbLampGeometry";
import { obstacleSegments } from "./RgbLampObstacles";
import { RgbLampPower } from "./RgbLampPower";
import { isTurning, rgbLampBeamDirection } from "./RgbLampRotation";
import { rgbLampColour, rgbLampLight, rgbLampSettingsOf, type RgbLampSettings } from "./RgbLampSettings";
import { RgbLampVisual } from "./RgbLampVisual";

/** At most this many turning lamps are drawn again in one image: the others wait for the next ones. */
const MAX_TURNING_REDRAWS_PER_FRAME = 4;
/** A turning beam is drawn again once it has moved by this many degrees: not at every image of a slow lamp. */
const MIN_TURN_STEP_DEGREES = 1;

interface PlacedRgbLamp {
    entity: Entity;
    visual: RgbLampVisual;
    /** The light as it was last drawn: where it is, its cone and its colour. */
    key: string;
    /** The segments that stopped it when it was last drawn. */
    segmentsKey: string;
    /** The state of the obstacles of the map it was last checked against (see LightObstacleReader.version). */
    obstaclesVersion: number;
    light: LightCone | undefined;
    revision: number;
    visible: boolean;
    /**
     * A turning lamp: everything its light depends on but the direction of the beam (where it is, its reach, its
     * opening, its colour), and the full turn of light cast from there, out of which the beam is cut as it turns.
     */
    turnKey: string;
    fullTurn: readonly Point[] | undefined;
    /** The image of the last drawing: the turning lamps drawn longest ago come first when too many wait. */
    drawnAt: number;
    /** The lights the walls send back (see bounceSources): their images, kept, and how many are lit now. */
    bounceVisuals: RgbLampVisual[];
    bounces: LightCone[];
}

/** The beam of a turning lamp, to be drawn: where it points now, in the colour and at the intensity that were set. */
interface TurningBeam {
    lamp: PlacedRgbLamp;
    light: LightCone;
    colour: number;
    intensity: number;
    direction: number;
}

/** What the lamps are given in place of the clock of the server and of the preference of the system (tests). */
export interface RgbLampsOptions {
    /** Milliseconds since the Unix epoch, as all players see them. */
    now?: () => number;
    /** The preference of the system: turning lamps stand still. */
    reducedMotion?: boolean;
    /** Whether a switch left the lamp on (see EntityStatesManager); every lamp is on when absent. */
    isOn?: (entityId: string) => boolean;
    /** The clock the fade of a lamp switched on or off follows: the one of the computer when absent. */
    fadeNow?: () => number;
}

function isRgbLamp(entity: Entity): boolean {
    return entity.getPrefab().lamp?.kind === "rgb";
}

/**
 * The RGB lamps of the map: the objects whose catalog entry says `lamp.kind: "rgb"`. Each lights a cone of its colour
 * (see RgbLampPropertyData), stopped by the walls of the map, the walls of the map layer and the tall objects, all the
 * time, by day and by night, with or without music.
 *
 * A light is only computed and drawn again when something it depends on changed: the lamp was moved or set (looked at
 * at every image, so that the light follows a drag in the editor), or a wall, a door or a tall object changed within
 * its reach (looked at with the objects of the map, a few times a second). A lamp that stands still costs nothing.
 *
 * A turning lamp (a rotating beacon, see rgbLampBeamDirection) casts its full turn of light only when one of those
 * changes, and cuts its beam out of it as it turns, without casting a ray (coneOfLitPolygon). Its texture is drawn
 * again at most at every image, only while its light is on the screen, and for at most a few turning lamps per image.
 * It stands still with reduced motion, with the light effects turned off for this player, and while the map editor is
 * open, where the handles stay on the beam.
 */
export class RgbLamps {
    private readonly lamps = new Map<string, PlacedRgbLamp>();
    private readonly unsubscribePreview: Unsubscriber;
    private preview: { entityId: string; settings: RgbLampSettings } | undefined;
    private revisions = 0;
    private frame = 0;
    private readonly reducedMotion: boolean;
    private readonly now: () => number;
    private readonly isOn: (entityId: string) => boolean;
    private readonly fadeNow: () => number;
    private readonly power: RgbLampPower;
    // Asked for the time only once a lamp turns: a map without one sends nothing to the server.
    private serverClock: ServerNightClock | undefined;

    // The obstacles of the map, as last read: each lamp checks whether what stops its own light changed.
    private readonly obstacles: LightObstaclesByLevel;

    constructor(
        private readonly scene: GameScene,
        private readonly depth: number,
        options: RgbLampsOptions = {},
    ) {
        this.unsubscribePreview = rgbLampPreviewStore.subscribe((preview) => (this.preview = preview));
        this.obstacles = new LightObstaclesByLevel(scene, () => this.tileSize());
        this.reducedMotion = options.reducedMotion ?? false;
        this.isOn = options.isOn ?? ((): boolean => true);
        this.fadeNow = options.fadeNow ?? Date.now;
        this.power = new RgbLampPower(() => this.reducedMotion);
        // The clock of the server, so that a computer whose clock is wrong turns its lamps with the others; the
        // computer's clock until the server answered (the beams jump once, then).
        this.now =
            options.now ??
            ((): number => {
                this.serverClock ??= new ServerNightClock();
                return this.serverClock.now()?.getTime() ?? Date.now();
            });
    }

    private tileSize(): number {
        return this.scene.getGameMapFrontWrapper().getMap().tilewidth ?? MAP_LAYER_TILE_SIZE;
    }

    /** Looks at the objects of the map: the lamps there are, and what stops their light. */
    public reconcile(entities: ReadonlyMap<string, Entity>): void {
        let removed = false;
        for (const [id, lamp] of this.lamps) {
            // An object can be replaced under the same id (an undo, a model changed).
            if (entities.get(id) !== lamp.entity || !isRgbLamp(lamp.entity)) {
                lamp.visual.destroy();
                lamp.bounceVisuals.forEach((visual) => visual.destroy());
                this.lamps.delete(id);
                this.power.forget(id);
                removed = true;
            }
        }
        for (const [id, entity] of entities) {
            if (isRgbLamp(entity) && !this.lamps.has(id)) {
                this.lamps.set(id, {
                    entity,
                    visual: new RgbLampVisual(this.scene, id, this.depth),
                    key: "",
                    segmentsKey: "",
                    obstaclesVersion: -1,
                    light: undefined,
                    revision: 0,
                    visible: false,
                    turnKey: "",
                    fullTurn: undefined,
                    drawnAt: 0,
                    bounceVisuals: [],
                    bounces: [],
                });
            }
        }
        if (removed) {
            this.publish();
            // The scene is only drawn when something changed: the light must leave the screen now.
            this.scene.markDirty();
        }
        if (this.lamps.size > 0) {
            this.obstacles.read(entities);
        }
    }

    /**
     * At every image: draws again the lights that changed, and only them. With the map editor open, or with the light
     * effects turned off for this player (lampEffectsEnabledStore), the turning lamps stand still at the direction that
     * was set; they turn again in step with the clock once both are back.
     */
    public update(editorOpen = false, effectsEnabled = true): void {
        if (this.lamps.size === 0) {
            return;
        }
        this.frame += 1;
        const tileSize = this.tileSize();
        const still = this.reducedMotion || editorOpen || !effectsEnabled;
        const turning: TurningBeam[] = [];
        let time: number | undefined;
        let changed = false;
        for (const [id, lamp] of this.lamps) {
            const { entity } = lamp;
            // A lamp a switch put out gives no light, and nothing through the night veil. In the map editor every
            // lamp shines, so that it can be set.
            const power = editorOpen ? 1 : this.power.level(id, this.isOn(id), this.fadeNow());
            const shown = entity.visible && power > 0;
            if (power === 0) {
                if (lamp.light || lamp.visible) {
                    // Drawn again from scratch once it is back on.
                    lamp.light = undefined;
                    lamp.key = "";
                    lamp.turnKey = "";
                    lamp.fullTurn = undefined;
                    lamp.visible = false;
                    lamp.visual.setVisible(false);
                    this.clearBounces(lamp);
                    changed = true;
                }
                continue;
            }
            // Read at every image: a script will be able to drive the lamp through its property.
            const settings =
                this.preview?.entityId === id ? this.preview.settings : rgbLampSettingsOf(entity.getProperties());
            const light = rgbLampLight(lampSource(entity, entity.getPrefab().lamp?.anchor), settings, tileSize);
            const intensity = (settings.intensity ?? 1) * power;
            if (isTurning(settings, still)) {
                time ??= this.now();
                const direction = rgbLampBeamDirection(settings, time, still);
                const beam = { lamp, light, colour: rgbLampColour(settings.color), intensity, direction };
                // A turning beam sends nothing back: its bounces would be cast again at every image.
                this.clearBounces(lamp);
                if (this.castFullTurn(id, lamp, light, settings.color, intensity)) {
                    // Set, moved, or newly turning: its first beam is drawn now, whatever the budget.
                    this.drawBeam(beam);
                    changed = true;
                } else {
                    turning.push(beam);
                }
            } else {
                changed = this.drawStill(id, lamp, light, settings.color, intensity) || changed;
            }
            if (lamp.visible !== shown) {
                lamp.visible = shown;
                lamp.visual.setVisible(lamp.visible);
                lamp.bounceVisuals.forEach((visual, index) =>
                    visual.setVisible(lamp.visible && index < lamp.bounces.length),
                );
                changed = true;
            }
        }
        changed = this.turn(turning) || changed;
        if (changed) {
            this.publish();
            // The scene is only drawn when something changed.
            this.scene.markDirty();
        }
    }

    /** The segments that stop a light, the lamp itself apart. */
    private segmentsFor(id: string, light: LightCone, obstacles: LightObstacleReader) {
        const segments = obstacleSegments(light, {
            grid: obstacles.grid,
            tileSize: this.tileSize(),
            walls: obstacles.walls,
            // A lamp that is itself a tall object does not stand in its own light.
            rectangles: obstacles.casters.filter((caster) => caster.entityId !== id).map((caster) => caster.rectangle),
        });
        const segmentsKey = segments
            .map((segment) => `${segment.ax},${segment.ay},${segment.bx},${segment.by}`)
            .join(";");
        return { segments, segmentsKey };
    }

    /** A lamp that does not turn: drawn again when it was moved or set, or when what stops its light changed. */
    private drawStill(id: string, lamp: PlacedRgbLamp, light: LightCone, color: string, intensity: number): boolean {
        // What stops the light on the floor of the map the lamp stands on.
        const obstacles = this.obstacles.at(lamp.entity.getElevation());
        const key = `${light.x},${light.y},${light.radius},${light.direction},${light.angle},${color},${intensity},${lightSoftEdgeVersion()}`;
        if (key === lamp.key && lamp.obstaclesVersion === obstacles.version) {
            return false;
        }
        const { segments, segmentsKey } = this.segmentsFor(id, light, obstacles);
        let drawn = false;
        if (key !== lamp.key || segmentsKey !== lamp.segmentsKey) {
            const polygon = litPolygon(light, segments);
            lamp.visual.draw(light, polygon, rgbLampColour(color), intensity);
            this.drawBounces(id, lamp, light, polygon, rgbLampColour(color), intensity, obstacles);
            lamp.revision = ++this.revisions;
            lamp.light = light;
            drawn = true;
        }
        lamp.key = key;
        lamp.segmentsKey = segmentsKey;
        lamp.obstaclesVersion = obstacles.version;
        // It may turn again later: its full turn is cast again then.
        lamp.turnKey = "";
        lamp.fullTurn = undefined;
        return drawn;
    }

    /**
     * The lights the walls send back from a lamp that does not turn (one bounce): each is a small light of its own,
     * cast against the same obstacles, in the colour of the lamp. They are cast again only with the lamp.
     */
    private drawBounces(
        id: string,
        lamp: PlacedRgbLamp,
        light: LightCone,
        polygon: readonly Point[],
        colour: number,
        intensity: number,
        obstacles: LightObstacleReader,
    ): void {
        const strength = lightBounceStrengthNow();
        const first = bounceSources(light, polygon, strength).map((source) => ({
            source,
            polygon: litPolygon(source, this.segmentsFor(id, source, obstacles).segments),
        }));
        // A second bounce, when asked: from the walls the first ones light.
        const second = lightSecondBounceNow()
            ? secondBounceSources(first, strength).map((source) => ({
                  source,
                  polygon: litPolygon(source, this.segmentsFor(id, source, obstacles).segments),
              }))
            : [];
        const bounces = [...first, ...second];
        bounces.forEach(({ source, polygon: reached }, index) => {
            const visual = (lamp.bounceVisuals[index] ??= new RgbLampVisual(
                this.scene,
                `${id}:bounce:${index}`,
                this.depth,
            ));
            visual.draw(source, reached, colour, source.intensity * intensity);
            visual.setVisible(lamp.visible);
        });
        lamp.bounceVisuals.slice(bounces.length).forEach((visual) => visual.setVisible(false));
        lamp.bounces = bounces.map(({ source }) => source);
    }

    private clearBounces(lamp: PlacedRgbLamp): void {
        if (lamp.bounces.length > 0) {
            lamp.bounceVisuals.forEach((visual) => visual.setVisible(false));
            lamp.bounces = [];
        }
    }

    /**
     * A turning lamp: casts its full turn of light again when it was moved or set, or when what stops its light
     * changed. True when its beam must be drawn now (its full turn is new).
     */
    private castFullTurn(id: string, lamp: PlacedRgbLamp, light: LightCone, color: string, intensity: number): boolean {
        // What stops the light on the floor of the map the lamp stands on.
        const obstacles = this.obstacles.at(lamp.entity.getElevation());
        const turnKey = `${light.x},${light.y},${light.radius},${light.angle},${color},${intensity}`;
        if (turnKey === lamp.turnKey && lamp.obstaclesVersion === obstacles.version && lamp.fullTurn) {
            return false;
        }
        const { segments, segmentsKey } = this.segmentsFor(id, light, obstacles);
        lamp.obstaclesVersion = obstacles.version;
        if (turnKey === lamp.turnKey && segmentsKey === lamp.segmentsKey && lamp.fullTurn) {
            // An obstacle changed elsewhere on the map: this light stays as it is.
            return false;
        }
        lamp.fullTurn = litPolygon({ ...light, angle: 360 }, segments);
        lamp.turnKey = turnKey;
        lamp.segmentsKey = segmentsKey;
        // It may stand still again later: it is drawn again then.
        lamp.key = "";
        return true;
    }

    /** Draws the beam of a turning lamp, cut out of its full turn. */
    private drawBeam({ lamp, light, colour, intensity, direction }: TurningBeam): void {
        const beam = { ...light, direction };
        lamp.visual.draw(beam, coneOfLitPolygon(lamp.fullTurn ?? [], beam), colour, intensity);
        lamp.revision = ++this.revisions;
        lamp.light = beam;
        lamp.drawnAt = this.frame;
    }

    /**
     * Draws again the turning beams that moved, while their light is on the screen: an angle that comes from the clock
     * has nothing to catch up on when it comes back. Those drawn longest ago first, a few per image.
     */
    private turn(turning: TurningBeam[]): boolean {
        const view = this.scene.cameras.main.worldView;
        const waiting = turning.filter(({ lamp, light, direction }) => {
            const away = Math.abs(
                ((((direction - (lamp.light?.direction ?? direction + 180)) % 360) + 540) % 360) - 180,
            );
            return (
                lamp.visible &&
                away >= MIN_TURN_STEP_DEGREES &&
                light.x + light.radius > view.x &&
                light.y + light.radius > view.y &&
                light.x - light.radius < view.x + view.width &&
                light.y - light.radius < view.y + view.height
            );
        });
        waiting.sort((a, b) => a.lamp.drawnAt - b.lamp.drawnAt);
        for (const beam of waiting.slice(0, MAX_TURNING_REDRAWS_PER_FRAME)) {
            this.drawBeam(beam);
        }
        return waiting.length > 0;
    }

    /** Tells the night veil where the lights are: it is pierced with their shape. */
    private publish(): void {
        const lights: RgbLampLight[] = [];
        for (const [id, lamp] of this.lamps) {
            if (lamp.visible && lamp.light) {
                lights.push({
                    id,
                    x: lamp.light.x - lamp.light.radius,
                    y: lamp.light.y - lamp.light.radius,
                    size: lamp.light.radius * 2,
                    textureKey: lamp.visual.textureKey,
                    revision: lamp.revision,
                    polygon: lamp.visual.polygon,
                    // The strength of the lamp is drawn into its texture, which pierces the veil as it is.
                    elevation: lamp.entity.getElevation(),
                    ...(lamp.visual.strength < 1 ? { ambient: lamp.visual.strength } : {}),
                });
                lamp.bounces.forEach((bounce, index) => {
                    const visual = lamp.bounceVisuals[index];
                    lights.push({
                        id: `${id}:bounce:${index}`,
                        x: bounce.x - bounce.radius,
                        y: bounce.y - bounce.radius,
                        size: bounce.radius * 2,
                        textureKey: visual.textureKey,
                        revision: lamp.revision,
                        polygon: visual.polygon,
                        elevation: lamp.entity.getElevation(),
                        ambient: visual.strength,
                    });
                });
            }
        }
        rgbLampLightsStore.set(lights);
    }

    public destroy(): void {
        this.unsubscribePreview();
        this.serverClock?.destroy();
        this.serverClock = undefined;
        for (const lamp of this.lamps.values()) {
            lamp.visual.destroy();
            lamp.bounceVisuals.forEach((visual) => visual.destroy());
        }
        this.lamps.clear();
        rgbLampLightsStore.set([]);
    }
}
