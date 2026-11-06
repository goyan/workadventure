/**
 * The space that relays the media of a Jam (its host's music, everyone's screens) is named after the Jam it serves:
 * `jam:<room>:<area>:<property>:<host>`, each part encoded without any `:` or `.`. The pusher puts the world in front
 * of the name (`<world>.jam:…`), so the name is read from its end. A name proves nothing by itself: whoever knows it can
 * ask to join, so the back decides on what the room holds, never on what the name says.
 */
const JAM_SPACE_NAME = /(?:^|\.)jam:([^:.]+):([^:.]+):([^:.]+):([^:.]+)$/;

export interface JamSpaceParts {
    roomUrl: string;
    areaId: string;
    propertyId: string;
    hostUuid: string;
}

function encodePart(value: string): string {
    return encodeURIComponent(value).replace(/\./g, "%2E");
}

export function buildJamSpaceName({ roomUrl, areaId, propertyId, hostUuid }: JamSpaceParts): string {
    return `jam:${[roomUrl, areaId, propertyId, hostUuid].map(encodePart).join(":")}`;
}

export function parseJamSpaceName(spaceName: string): JamSpaceParts | undefined {
    const match = JAM_SPACE_NAME.exec(spaceName);
    if (!match) {
        return undefined;
    }
    try {
        const [roomUrl, areaId, propertyId, hostUuid] = match.slice(1).map((part) => decodeURIComponent(part));
        return { roomUrl, areaId, propertyId, hostUuid };
    } catch {
        // A malformed escape sequence: not a name we built.
        return undefined;
    }
}
