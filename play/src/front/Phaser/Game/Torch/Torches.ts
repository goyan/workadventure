import type { PositionMessage_Direction } from "@workadventure/messages";
import type { RgbLampLight } from "../../../Stores/RgbLampStore";
import { torchLightsStore } from "../../../Stores/TorchStore";
import type { GameScene } from "../GameScene";
import { LightObstacleReader } from "../Lamps/LightObstacleReader";
import type { LightCone } from "../Lamps/RgbLampGeometry";
import { RgbLampVisual } from "../Lamps/RgbLampVisual";
import { MAP_LAYER_TILE_SIZE } from "../MapEditor/MapLayer/MapLayerCatalog";
import { TORCH_COLOUR } from "./TorchProtocol";
import { torchLightShape } from "./TorchLight";

/** The objects of the map (walls, doors, tall objects) are looked at this often while a torch is lit. */
const OBSTACLES_INTERVAL_MS = 250;
/** At most this many lights are computed and drawn again in one image: the others wait for the next ones. */
const MAX_REDRAWS_PER_FRAME = 4;

/** Someone holding a lit torch, as seen by this browser. */
export interface TorchBearer {
    /** The key of the player (MapPlayersByKey), or that of the local player. */
    id: string;
    /** The position of the avatar, in map pixels. */
    x: number;
    y: number;
    direction: PositionMessage_Direction;
    seated: boolean;
    /** How bright the flame is now (see torchFlicker). */
    intensity: number;
    /** The local player: their light is always drawn first. */
    local: boolean;
}

interface LitTorch {
    visual: RgbLampVisual;
    /** Where the flame was, and how it was held, when the light was last drawn. */
    key: string;
    /** The segments that stopped it when it was last drawn. */
    segmentsKey: string;
    obstaclesVersion: number;
    light: LightCone | undefined;
    revision: number;
    /** The image of the last drawing: the lights drawn longest ago come first when too many wait. */
    drawnAt: number;
    intensity: number | undefined;
}

/**
 * The lights of the torches the players hold: one light each, all around the flame, stopped by the same obstacles as
 * the RGB lamps (see LightObstacleReader). A light is only computed and drawn again when its bearer moved by a pixel,
 * turned or sat down, or when an obstacle within its reach changed: a bearer standing still costs nothing but the
 * flicker, which changes the brightness of the light and never its shape.
 */
export class Torches {
    private readonly torches = new Map<string, LitTorch>();
    private readonly obstacles: LightObstacleReader;
    private lastObstaclesAt: number | undefined;
    private frame = 0;
    private revisions = 0;
    private editorOpen = false;

    constructor(
        private readonly scene: GameScene,
        private readonly depth: number,
    ) {
        this.obstacles = new LightObstacleReader(scene, () => this.tileSize());
    }

    private tileSize(): number {
        return this.scene.getGameMapFrontWrapper().getMap().tilewidth ?? MAP_LAYER_TILE_SIZE;
    }

    /** At every image, with the bearers seen now. */
    public update(now: number, bearers: readonly TorchBearer[], editorOpen: boolean): void {
        this.frame += 1;
        let changed = this.removeGone(bearers);
        if (editorOpen !== this.editorOpen) {
            this.editorOpen = editorOpen;
            for (const torch of this.torches.values()) torch.visual.setVisible(!editorOpen);
            changed = true;
        }
        if (bearers.length > 0 && !editorOpen) {
            if (this.lastObstaclesAt === undefined || now - this.lastObstaclesAt >= OBSTACLES_INTERVAL_MS) {
                this.lastObstaclesAt = now;
                this.obstacles.read(this.scene.getGameMapFrontWrapper().getEntitiesManager().getEntities());
            }
            changed = this.redraw(bearers) || changed;
            if (this.flicker(bearers)) {
                this.scene.markDirty();
            }
        }
        if (changed) {
            this.publish();
            // The scene is only drawn when something changed.
            this.scene.markDirty();
        }
    }

    private removeGone(bearers: readonly TorchBearer[]): boolean {
        const ids = new Set(bearers.map((bearer) => bearer.id));
        let removed = false;
        for (const [id, torch] of this.torches) {
            if (!ids.has(id)) {
                torch.visual.destroy();
                this.torches.delete(id);
                removed = true;
            }
        }
        return removed;
    }

    /** Draws again the lights that changed: the local player's first, then those that waited the longest. */
    private redraw(bearers: readonly TorchBearer[]): boolean {
        const tileSize = this.tileSize();
        const waiting: { bearer: TorchBearer; torch: LitTorch; key: string }[] = [];
        for (const bearer of bearers) {
            let torch = this.torches.get(bearer.id);
            if (!torch) {
                torch = {
                    visual: new RgbLampVisual(this.scene, `torch:${bearer.id}`, this.depth),
                    key: "",
                    segmentsKey: "",
                    obstaclesVersion: -1,
                    light: undefined,
                    revision: 0,
                    drawnAt: 0,
                    intensity: undefined,
                };
                this.torches.set(bearer.id, torch);
            }
            const key = `${Math.round(bearer.x)},${Math.round(bearer.y)},${bearer.direction},${bearer.seated}`;
            if (key !== torch.key || torch.obstaclesVersion !== this.obstacles.version) {
                waiting.push({ bearer, torch, key });
            }
        }
        waiting.sort((a, b) => Number(b.bearer.local) - Number(a.bearer.local) || a.torch.drawnAt - b.torch.drawnAt);
        let drawn = false;
        for (const { bearer, torch, key } of waiting.slice(0, MAX_REDRAWS_PER_FRAME)) {
            const { light, polygon, segments } = torchLightShape(
                {
                    x: Math.round(bearer.x),
                    y: Math.round(bearer.y),
                    direction: bearer.direction,
                    seated: bearer.seated,
                },
                {
                    grid: this.obstacles.grid,
                    tileSize,
                    walls: this.obstacles.walls,
                    rectangles: this.obstacles.casters.map((caster) => caster.rectangle),
                },
            );
            const segmentsKey = segments
                .map((segment) => `${segment.ax},${segment.ay},${segment.bx},${segment.by}`)
                .join(";");
            torch.obstaclesVersion = this.obstacles.version;
            torch.drawnAt = this.frame;
            // An obstacle changed elsewhere on the map: this light stays as it is.
            if (key === torch.key && segmentsKey === torch.segmentsKey) {
                continue;
            }
            if (!torch.light) {
                // Hidden until it has a shape: a new light shows when it is drawn.
                torch.visual.setVisible(!this.editorOpen);
            }
            torch.visual.draw(light, polygon, TORCH_COLOUR);
            torch.light = light;
            torch.key = key;
            torch.segmentsKey = segmentsKey;
            torch.revision = ++this.revisions;
            drawn = true;
        }
        return drawn;
    }

    /** Sets the brightness of each light; true when one on the screen changed. */
    private flicker(bearers: readonly TorchBearer[]): boolean {
        const view = this.scene.cameras.main.worldView;
        let seen = false;
        for (const bearer of bearers) {
            const torch = this.torches.get(bearer.id);
            if (!torch || torch.intensity === bearer.intensity) {
                continue;
            }
            torch.intensity = bearer.intensity;
            torch.visual.setIntensity(bearer.intensity);
            const light = torch.light;
            if (
                light &&
                light.x + light.radius > view.x &&
                light.y + light.radius > view.y &&
                light.x - light.radius < view.x + view.width &&
                light.y - light.radius < view.y + view.height
            ) {
                seen = true;
            }
        }
        return seen;
    }

    /** Tells the night veil where the lights are: it is pierced with their shape. */
    private publish(): void {
        const lights: RgbLampLight[] = [];
        if (!this.editorOpen) {
            for (const [id, torch] of this.torches) {
                if (torch.light) {
                    lights.push({
                        id: `torch:${id}`,
                        x: torch.light.x - torch.light.radius,
                        y: torch.light.y - torch.light.radius,
                        size: torch.light.radius * 2,
                        textureKey: torch.visual.textureKey,
                        revision: torch.revision,
                    });
                }
            }
        }
        torchLightsStore.set(lights);
    }

    public destroy(): void {
        for (const torch of this.torches.values()) {
            torch.visual.destroy();
        }
        this.torches.clear();
        torchLightsStore.set([]);
    }
}
