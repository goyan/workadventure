import { z } from "zod";

export const KARAOKE_STAGE_STATE_EVENT = "workadventure.karaoke-stage-state";
export const KARAOKE_STAGE_ACTION_EVENT = "workadventure.karaoke-stage-action";
export const KaraokeStageIdentitySchema = z.object({
    areaId: z.string().min(1).max(200),
    propertyId: z.string().min(1).max(200),
    hostUuid: z.string().min(1).max(256),
});
export const KaraokeStageStateSchema = KaraokeStageIdentitySchema.extend({
    enabled: z.boolean(),
    turnId: z.string().uuid(),
    singerUuid: z.string().min(1).max(256).nullable(),
    queue: z.array(z.string().min(1).max(256)).max(20),
    applause: z.number().int().min(0).max(100_000),
});
export type KaraokeStageState = z.infer<typeof KaraokeStageStateSchema>;
export enum KaraokeStageAction {
    Request = "request",
    Join = "join",
    Leave = "leave",
    Clap = "clap",
}
export enum KaraokeMode {
    Listen = "listen",
    Game = "game",
}
export const KaraokeStageActionSchema = KaraokeStageIdentitySchema.extend({
    action: z.nativeEnum(KaraokeStageAction),
});

export interface KaraokeStageSpaceParts {
    roomUrl: string;
    areaId: string;
    propertyId: string;
    hostUuid: string;
    turnId: string;
    singerUuid: string;
}

/** A new media room per turn: previous singers cannot send audio to the new audience. */
export function buildKaraokeStageSpaceName(parts: KaraokeStageSpaceParts): string {
    return `karaoke:${[parts.roomUrl, parts.areaId, parts.propertyId, parts.hostUuid, parts.turnId, parts.singerUuid]
        .map((part) => encodeURIComponent(part).replace(/\./g, "%2E"))
        .join(":")}`;
}

export function parseKaraokeStageSpaceName(name: string): KaraokeStageSpaceParts | undefined {
    const match = /(?:^|\.)karaoke:([^:.]+):([^:.]+):([^:.]+):([^:.]+):([^:.]+):([^:.]+)$/.exec(name);
    if (!match) return undefined;
    try {
        const [roomUrl, areaId, propertyId, hostUuid, turnId, singerUuid] = match.slice(1).map(decodeURIComponent);
        if (!KaraokeStageStateSchema.shape.turnId.safeParse(turnId).success) return undefined;
        return { roomUrl, areaId, propertyId, hostUuid, turnId, singerUuid };
    } catch {
        return undefined;
    }
}
