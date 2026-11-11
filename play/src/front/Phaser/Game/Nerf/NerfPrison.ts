/** A rectangle of the map, in pixels. */
export interface NerfZone {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** Name of the area where eliminated players are sent, as written in the map editor. */
const PRISON_NAME = "prison des régressions";

function normalize(name: string): string {
    return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("fr");
}

/** The prison of the map: the area named "Prison des régressions" (case and extra spaces ignored), if any. */
export function findNerfPrison(areas: Iterable<{ name?: string } & NerfZone>): NerfZone | undefined {
    for (const area of areas) {
        if (area.name !== undefined && normalize(area.name) === PRISON_NAME) {
            return { x: area.x, y: area.y, width: area.width, height: area.height };
        }
    }
    return undefined;
}

/** Whether the point is strictly inside the zone; never without a zone. */
export function isInZone(zone: NerfZone | undefined, point: { x: number; y: number }): boolean {
    return (
        zone !== undefined &&
        point.x > zone.x &&
        point.x < zone.x + zone.width &&
        point.y > zone.y &&
        point.y < zone.y + zone.height
    );
}

export function zoneCenter(zone: NerfZone): { x: number; y: number } {
    return { x: zone.x + zone.width / 2, y: zone.y + zone.height / 2 };
}
