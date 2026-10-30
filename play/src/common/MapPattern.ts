import { z } from "zod";
import { AreaData, EntityDimensions, WAMEntityData } from "@workadventure/map-editor";

/** Maximum number of items of one pattern: same limit as the Admin API envelope check. */
export const MAP_PATTERN_MAX_ITEMS = 2000;
export const MAP_PATTERN_MAX_NAME_LENGTH = 60;

/**
 * A pattern shared between the map editors: a group of entities and areas copied from a selection.
 * Item positions are relative to the top-left corner of `bounds` (x, y >= 0) and the original ids are not stored:
 * a new id is created when the pattern is pasted.
 */
export const MapPatternPayload = z.object({
    version: z.literal(1),
    bounds: z.object({ width: z.number().nonnegative(), height: z.number().nonnegative() }),
    items: z
        .array(
            z.discriminatedUnion("kind", [
                z.object({
                    kind: z.literal("entity"),
                    data: WAMEntityData,
                    dimensions: EntityDimensions,
                    collisionGrid: z.array(z.array(z.number())).optional(),
                }),
                z.object({ kind: z.literal("area"), data: AreaData }),
            ]),
        )
        .min(1)
        .max(MAP_PATTERN_MAX_ITEMS),
});
export type MapPatternPayload = z.infer<typeof MapPatternPayload>;
export type MapPatternItem = MapPatternPayload["items"][number];

/** What the Admin API returns for a pattern, without its payload. It never reaches the browser: see the "ForClient" shapes. */
export const MapPatternSummary = z.object({
    id: z.string(),
    name: z.string(),
    entityCount: z.number().int().nonnegative(),
    areaCount: z.number().int().nonnegative(),
    createdBy: z.string(),
    createdAt: z.string(),
});
export type MapPatternSummary = z.infer<typeof MapPatternSummary>;

export const MapPatternList = z.object({ patterns: z.array(MapPatternSummary) });

export const MapPatternDetail = MapPatternSummary.extend({ payload: MapPatternPayload });
export type MapPatternDetail = z.infer<typeof MapPatternDetail>;

/**
 * What the pusher sends to the browser: the author is replaced by the right to delete, computed on the server
 * (the author or an administrator), so the browser never learns who created a pattern.
 */
export const MapPatternSummaryForClient = MapPatternSummary.omit({ createdBy: true }).extend({
    canDelete: z.boolean(),
});
export type MapPatternSummaryForClient = z.infer<typeof MapPatternSummaryForClient>;

export const MapPatternListForClient = z.object({ patterns: z.array(MapPatternSummaryForClient) });
export type MapPatternListForClient = z.infer<typeof MapPatternListForClient>;

export const MapPatternDetailForClient = MapPatternSummaryForClient.extend({ payload: MapPatternPayload });
export type MapPatternDetailForClient = z.infer<typeof MapPatternDetailForClient>;
