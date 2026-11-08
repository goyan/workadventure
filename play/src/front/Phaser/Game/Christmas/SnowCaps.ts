import { MAP_LAYER_FLOOR_COLLECTION } from "../MapEditor/MapLayer/MapLayerCatalog";
import { OUTDOOR_WALL_COLLECTIONS, type OutdoorGrid } from "../Outdoor/OutdoorGrid";
import { paintSnowCap } from "./SnowCapShape";

/** The part of a map entity the snow needs (an `Entity` fits). */
export interface SnowEntity {
    x: number;
    y: number;
    displayWidth: number;
    displayHeight: number;
    depth: number;
    /** Hidden while its image loads. */
    visible: boolean;
    texture: { key: string };
    frame: { name: string | number; width: number; height: number };
    getPrefab(): { collectionName: string; id: string; seasonal?: unknown };
}

/** One byte of alpha per pixel of an entity's frame. */
export interface AlphaMask {
    width: number;
    height: number;
    alpha: Uint8ClampedArray;
}

export const FLOOR_COLLECTIONS: readonly string[] = [MAP_LAYER_FLOOR_COLLECTION, "Infogène Sols"];
const FROST_COLOR = 0xeef1fb;
export const MISSING_TEXTURE = "__MISSING";
const FROST_ALPHA = 0.35;

type SnowObject = Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;

/** Snow on the objects placed outdoors: a cap on top of each object, a light frost on outdoor floors. */
export class SnowCaps {
    /** Cap texture key per entity frame, or undefined when its pixels cannot be read. */
    private readonly caps = new Map<string, string | undefined>();
    private objects: SnowObject[] = [];
    private visible = true;

    constructor(
        private readonly scene: Phaser.Scene,
        private readonly readPixels: (entity: SnowEntity) => AlphaMask | undefined,
    ) {}

    rebuild(entities: Iterable<SnowEntity>, grid: OutdoorGrid): void {
        this.clear();
        for (const entity of entities) {
            // Not loaded yet: Phaser shows its placeholder texture, which must not get snow.
            if (!entity.visible || entity.texture.key === MISSING_TEXTURE) continue;
            const { collectionName, seasonal } = entity.getPrefab();
            if (OUTDOOR_WALL_COLLECTIONS.includes(collectionName)) continue;
            // Seasonal objects (trees) carry their own snow in their winter image.
            if (seasonal) continue;
            // An object stands where its feet are: the middle of its bottom edge.
            if (!grid.isOutdoorAt(entity.x + entity.displayWidth / 2, entity.y + entity.displayHeight - 1)) continue;
            if (FLOOR_COLLECTIONS.includes(collectionName)) {
                const frost = this.scene.add.rectangle(
                    entity.x,
                    entity.y,
                    entity.displayWidth,
                    entity.displayHeight,
                    FROST_COLOR,
                    FROST_ALPHA,
                );
                frost.setOrigin(0);
                frost.setDepth(entity.depth + 0.05);
                frost.setVisible(this.visible);
                this.objects.push(frost);
                continue;
            }
            const key = this.capTexture(entity);
            if (!key) continue;
            const cap = this.scene.add.image(entity.x, entity.y, key);
            cap.setOrigin(0);
            cap.setScale(entity.displayWidth / entity.frame.width, entity.displayHeight / entity.frame.height);
            cap.setDepth(entity.depth + 0.1);
            cap.setVisible(this.visible);
            this.objects.push(cap);
        }
    }

    setVisible(visible: boolean): void {
        this.visible = visible;
        for (const object of this.objects) object.setVisible(visible);
    }

    destroy(): void {
        this.clear();
        for (const key of this.caps.values()) {
            if (key && this.scene.textures.exists(key)) this.scene.textures.remove(key);
        }
        this.caps.clear();
    }

    private clear(): void {
        for (const object of this.objects) object.destroy();
        this.objects = [];
    }

    private capTexture(entity: SnowEntity): string | undefined {
        const key = `xmas-cap:${entity.texture.key}:${entity.frame.name}`;
        if (this.caps.has(key)) return this.caps.get(key);
        this.caps.set(key, undefined);
        let mask: AlphaMask | undefined;
        try {
            mask = this.readPixels(entity);
        } catch {
            // A texture the browser refuses to read (CORS): this object simply gets no snow.
            return undefined;
        }
        if (!mask) return undefined;
        const canvas = this.scene.textures.createCanvas(key, mask.width, mask.height);
        const context = canvas?.getContext();
        if (!canvas || !context) return undefined;
        const image = context.createImageData(mask.width, mask.height);
        image.data.set(paintSnowCap(mask.alpha, mask.width, mask.height));
        context.putImageData(image, 0, 0);
        canvas.refresh();
        this.caps.set(key, key);
        return key;
    }
}
