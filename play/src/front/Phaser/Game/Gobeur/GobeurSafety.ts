import type { AreaData } from "@workadventure/map-editor";

export interface Point {
    x: number;
    y: number;
}

type AreaBounds = Pick<AreaData, "x" | "y" | "width" | "height">;

/**
 * Whether the point lies inside the area (borders included).
 * Area coordinates are the top-left corner plus size, in pixels.
 */
export function isInsideArea(area: AreaBounds, point: Point): boolean {
    return point.x >= area.x && point.x <= area.x + area.width && point.y >= area.y && point.y <= area.y + area.height;
}

/**
 * Finds the personal area owned by the given user, like GameScene does for the personal desk.
 */
export function personalAreaOf(uuid: string, areas: Iterable<AreaData>): AreaData | undefined {
    for (const area of areas) {
        const property = area.properties.find((property) => property.type === "personalAreaPropertyData");
        if (property && property.type === "personalAreaPropertyData" && property.ownerId === uuid) {
            return area;
        }
    }
    return undefined;
}

/**
 * A player is safe inside their personal area. Only players without a personal area
 * may use the fallback safe area.
 */
export function isSafe(
    uuid: string,
    point: Point,
    areas: Iterable<AreaData>,
    fallbackSafeAreaId: string | undefined,
): boolean {
    const areaList = Array.from(areas);
    const personal = personalAreaOf(uuid, areaList);
    if (personal) {
        return isInsideArea(personal, point);
    }
    if (fallbackSafeAreaId === undefined) {
        return false;
    }
    const fallback = areaList.find((area) => area.id === fallbackSafeAreaId);
    return fallback !== undefined && isInsideArea(fallback, point);
}

export function areaCentre(area: AreaBounds): Point {
    return { x: area.x + area.width / 2, y: area.y + area.height / 2 };
}
