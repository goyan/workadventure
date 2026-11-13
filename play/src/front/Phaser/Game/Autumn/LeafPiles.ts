import { FLOOR_COLLECTIONS, MISSING_TEXTURE, type AlphaMask, type SnowEntity } from "../Christmas/SnowCaps";
import { OUTDOOR_WALL_COLLECTIONS, type OutdoorGrid } from "../Outdoor/OutdoorGrid";
import { leafPileHeight, leafPileSpan, paintLeafPile } from "./LeafPileShape";

/** The pile's bottom sits this far under the object's, as if the leaves had piled up against it. */
const PILE_OVERHANG_PX = 2;

interface PileTexture {
    key: string;
    left: number;
    /** Lowest opaque row of the frame: where the object stands. */
    bottom: number;
    height: number;
}

/** A small mound of leaves at the foot of each object placed outdoors, trees included. */
export class LeafPiles {
    /** Pile texture per entity frame, or undefined when its pixels cannot be read or it has no base. */
    private readonly textures = new Map<string, PileTexture | undefined>();
    private images: Phaser.GameObjects.Image[] = [];
    private visible = true;
    private alpha = 1;

    constructor(
        private readonly scene: Phaser.Scene,
        private readonly readPixels: (entity: SnowEntity) => AlphaMask | undefined,
    ) {}

    rebuild(entities: Iterable<SnowEntity>, grid: OutdoorGrid): void {
        this.clear();
        for (const entity of entities) {
            if (!entity.visible || entity.texture.key === MISSING_TEXTURE) continue;
            const { collectionName } = entity.getPrefab();
            if (OUTDOOR_WALL_COLLECTIONS.includes(collectionName) || FLOOR_COLLECTIONS.includes(collectionName))
                continue;
            if (!grid.isOutdoorAt(entity.x + entity.displayWidth / 2, entity.y + entity.displayHeight - 1)) continue;
            const pile = this.pileTexture(entity);
            if (!pile) continue;
            const scaleX = entity.displayWidth / entity.frame.width;
            const scaleY = entity.displayHeight / entity.frame.height;
            const image = this.scene.add.image(
                entity.x + pile.left * scaleX,
                entity.y + (pile.bottom + 1 + PILE_OVERHANG_PX - pile.height) * scaleY,
                pile.key,
            );
            image.setOrigin(0);
            image.setScale(scaleX, scaleY);
            image.setDepth(entity.depth + 0.1);
            image.setVisible(this.visible);
            image.setAlpha(this.alpha);
            this.images.push(image);
        }
    }

    setVisible(visible: boolean): void {
        this.visible = visible;
        for (const image of this.images) image.setVisible(visible);
    }

    setAlpha(alpha: number): void {
        this.alpha = alpha;
        for (const image of this.images) image.setAlpha(alpha);
    }

    destroy(): void {
        this.clear();
        for (const pile of this.textures.values()) {
            if (pile && this.scene.textures.exists(pile.key)) this.scene.textures.remove(pile.key);
        }
        this.textures.clear();
    }

    private clear(): void {
        for (const image of this.images) image.destroy();
        this.images = [];
    }

    private pileTexture(entity: SnowEntity): PileTexture | undefined {
        const key = `leaf-pile:${entity.texture.key}:${entity.frame.name}`;
        if (this.textures.has(key)) return this.textures.get(key);
        this.textures.set(key, undefined);
        let mask: AlphaMask | undefined;
        try {
            mask = this.readPixels(entity);
        } catch {
            // A texture the browser refuses to read (CORS): this object simply gets no pile.
            return undefined;
        }
        if (!mask) return undefined;
        const span = leafPileSpan(mask.alpha, mask.width, mask.height);
        if (!span) return undefined;
        const width = span.right - span.left + 1;
        const height = leafPileHeight(mask.height);
        const canvas = this.scene.textures.createCanvas(key, width, height);
        const context = canvas?.getContext();
        if (!canvas || !context) return undefined;
        const image = context.createImageData(width, height);
        image.data.set(paintLeafPile(width, height, key.length));
        context.putImageData(image, 0, 0);
        canvas.refresh();
        const pile = { key, left: span.left, bottom: span.bottom, height };
        this.textures.set(key, pile);
        return pile;
    }
}
