import type { AxiosInstance } from "axios";
import axios from "axios";
import { z } from "zod";
import { MapsCacheFileFormat } from "@workadventure/map-editor";

const MAX_NAME_LENGTH = 60;
const ONE_HOUR_IN_MS = 60 * 60 * 1000;
const ONE_MINUTE_IN_MS = 60 * 1000;
const MAX_QUERIES_PER_MINUTE = 30;

export type MapCreationErrorCode = "invalid-name" | "forbidden" | "rate-limit" | "quota-total" | "storage-failure";

export class MapCreationError extends Error {
    constructor(
        public readonly code: MapCreationErrorCode,
        message: string,
        options?: ErrorOptions,
    ) {
        super(message, options);
        this.name = "MapCreationError";
    }
}

export interface MapCreationConfig {
    /** Tag required to create a map, or "*" for every user who can edit the map (development only). */
    creatorTag: string;
    maxPerUserPerHour: number;
    /** Admin API that copies the template: it alone holds the map-storage write credential. */
    adminApiUrl: string;
    /** Value of the Authorization header sent to the Admin API (ADMIN_API_TOKEN). */
    authorization: string;
    /** Internal URL of map-storage, without the public path prefix. Read only: lists the existing rooms. */
    mapStorageUrl: string;
}

interface MapCreationEnvironment {
    creatorTag: string;
    maxPerUserPerHour: number;
    adminApiUrl: string | undefined;
    adminApiToken: string | undefined;
    mapStorageUrl: string | undefined;
    /** True when the pusher runs in production: the "*" wildcard tag is then refused. */
    production: boolean;
}

/** Folder and room returned by the Admin API: only a "carte-" folder, so an exit can never point elsewhere. */
const CreatedMap = z
    .object({ folder: z.string().regex(/^carte-[a-z0-9]+(?:-[a-z0-9]+)*$/), roomUrl: z.string() })
    .refine((created) => created.roomUrl === `/~/${created.folder}/office.wam`);

/**
 * Undefined means the feature is disabled: it needs the Admin API (which creates the map) and the internal URL of
 * map-storage (which lists the rooms). The pusher holds no map-storage write credential.
 */
export function readMapCreationConfig(env: MapCreationEnvironment): MapCreationConfig | undefined {
    if (!env.adminApiUrl || !env.adminApiToken || !env.mapStorageUrl) {
        return undefined;
    }
    // "*" lets every editor create maps: a development convenience that must never reach production by mistake.
    if (env.creatorTag === "*" && env.production) {
        return undefined;
    }
    return {
        creatorTag: env.creatorTag,
        maxPerUserPerHour: env.maxPerUserPerHour,
        adminApiUrl: env.adminApiUrl.replace(/\/+$/, ""),
        authorization: env.adminApiToken,
        mapStorageUrl: env.mapStorageUrl.replace(/\/+$/, ""),
    };
}

/** The user must be able to edit the room AND carry the creator tag (or the development wildcard). */
export function canCreateMap(canEdit: boolean, tags: string[], creatorTag: string): boolean {
    return canEdit && (creatorTag === "*" || tags.includes(creatorTag));
}

/**
 * Path of the room in map-storage ("folder/office.wam") when the URL designates a room of THIS world: same origin as the
 * front, "/~/<path>.wam", no traversal. The URL comes from the browser, so it is never used as is to decide a right.
 */
export function roomPathFromUrl(roomUrl: string, frontUrl: string): string | undefined {
    let room: URL;
    let front: URL;
    try {
        room = new URL(roomUrl);
        front = new URL(frontUrl);
    } catch {
        return undefined;
    }
    if (room.origin !== front.origin) {
        return undefined;
    }
    return /^\/~\/([A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*\.wam)$/.exec(room.pathname)?.[1];
}

export interface CreationRightDependencies {
    /** Right of the authenticated user, computed by the Admin API for this room. Undefined when it cannot be known. */
    fetchMember(trustedRoomUrl: string): Promise<{ canEdit: boolean; tags: string[] } | undefined>;
    roomExists(roomPath: string): Promise<boolean>;
}

/**
 * The browser designates the room used as authorization context: it must be a room of this world, the right is asked
 * to the Admin API first (cheap to refuse), and the room must exist in map-storage only once the right is granted.
 */
export async function isCreationAllowed(
    roomUrl: string,
    pusherUrl: string,
    creatorTag: string,
    dependencies: CreationRightDependencies,
): Promise<boolean> {
    const roomPath = roomPathFromUrl(roomUrl, pusherUrl);
    if (roomPath === undefined) {
        return false;
    }
    const member = await dependencies.fetchMember(new URL(`/~/${roomPath}`, pusherUrl).toString());
    if (member === undefined || !canCreateMap(member.canEdit, member.tags, creatorTag)) {
        return false;
    }
    return dependencies.roomExists(roomPath);
}

export class MapCreationService {
    private readonly recentCreations = new Map<string, number[]>();
    private readonly recentQueries = new Map<string, number[]>();

    constructor(
        private readonly config: MapCreationConfig,
        private readonly http: AxiosInstance = axios,
        private readonly now: () => number = Date.now,
    ) {}

    /** Limits how often one user can ask for the right (every query reaches the Admin API and map-storage). */
    public assertQueryWithinRate(userIdentifier: string): void {
        const recent = this.recentTimes(this.recentQueries, userIdentifier, ONE_MINUTE_IN_MS);
        if (recent.length >= MAX_QUERIES_PER_MINUTE) {
            throw new MapCreationError("rate-limit", "Too many queries in the last minute");
        }
        recent.push(this.now());
    }

    /**
     * Asks the Admin API to copy its template into a new folder and returns the room URL to use in an exit.
     * The Admin API checks the tag again, simplifies the name, applies the total limit and creates one map at a time.
     * The hourly slot is reserved BEFORE the first await, so parallel requests cannot all pass the same check.
     */
    public async createMap(userIdentifier: string, rawName: string): Promise<{ folder: string; roomUrl: string }> {
        const name = rawName.trim();
        if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
            throw new MapCreationError("invalid-name", `The name must have 1 to ${MAX_NAME_LENGTH} characters`);
        }
        const reservedAt = this.reserveUserSlot(userIdentifier);
        let succeeded = false;
        try {
            const created = await this.requestCreation(userIdentifier, name);
            succeeded = true;
            return created;
        } finally {
            if (!succeeded) {
                this.releaseUserSlot(userIdentifier, reservedAt);
            }
        }
    }

    private async requestCreation(userIdentifier: string, name: string): Promise<{ folder: string; roomUrl: string }> {
        const response = await this.callRemote("Admin API", () =>
            this.http.post(
                `${this.config.adminApiUrl}/api/room/create`,
                { name, userIdentifier },
                {
                    headers: { Authorization: this.config.authorization },
                    // The Admin API lists the maps (10 s) then copies the template (60 s).
                    timeout: 75_000,
                    validateStatus: () => true,
                },
            ),
        );
        switch (response.status) {
            case 201: {
                const created = CreatedMap.safeParse(response.data);
                if (!created.success) {
                    throw new MapCreationError("storage-failure", "The Admin API returned an unexpected map");
                }
                return { folder: created.data.folder, roomUrl: created.data.roomUrl };
            }
            case 400:
                throw new MapCreationError("invalid-name", "The Admin API refused the name");
            case 403:
                throw new MapCreationError("forbidden", "The Admin API refused the creation right");
            case 409:
                throw new MapCreationError("quota-total", "The maximum number of created maps is reached");
            default:
                throw new MapCreationError(
                    "storage-failure",
                    `The Admin API refused the creation (HTTP ${response.status})`,
                );
        }
    }

    /** True when the room is a map served by map-storage: the authorization context cannot be an arbitrary URL. */
    public async roomExists(roomPath: string): Promise<boolean> {
        return (await this.listMapPaths()).includes(roomPath);
    }

    private async listMapPaths(): Promise<string[]> {
        const response = await this.callRemote("map-storage", () =>
            this.http.get(`${this.config.mapStorageUrl}/maps`, { timeout: 15_000, validateStatus: () => true }),
        );
        const parsed = MapsCacheFileFormat.safeParse(response.data);
        if (response.status !== 200 || !parsed.success) {
            throw new MapCreationError("storage-failure", `Cannot list the maps (HTTP ${response.status})`);
        }
        return Object.keys(parsed.data.maps);
    }

    /**
     * Network failures (refused connection, timeout, DNS) reject with an Axios error that carries the request
     * configuration, so the Admin API token: it is replaced by a sanitized error and never reaches a log or Sentry.
     */
    private async callRemote<T>(service: string, call: () => Promise<T>): Promise<T> {
        try {
            return await call();
        } catch (e) {
            const reason = axios.isAxiosError(e) ? (e.code ?? "network error") : "unexpected error";
            throw new MapCreationError("storage-failure", `${service} unreachable`, { cause: new Error(reason) });
        }
    }

    private reserveUserSlot(userIdentifier: string): number {
        const recent = this.recentTimes(this.recentCreations, userIdentifier, ONE_HOUR_IN_MS);
        if (recent.length >= this.config.maxPerUserPerHour) {
            throw new MapCreationError("rate-limit", "Too many maps created in the last hour");
        }
        const reservedAt = this.now();
        recent.push(reservedAt);
        return reservedAt;
    }

    private releaseUserSlot(userIdentifier: string, reservedAt: number): void {
        const recent = this.recentCreations.get(userIdentifier) ?? [];
        const index = recent.indexOf(reservedAt);
        if (index !== -1) {
            recent.splice(index, 1);
        }
    }

    /** Times of the window, kept in the map; a user with no recent time is removed so the map does not grow forever. */
    private recentTimes(store: Map<string, number[]>, userIdentifier: string, windowInMs: number): number[] {
        const since = this.now() - windowInMs;
        const recent = (store.get(userIdentifier) ?? []).filter((time) => time > since);
        if (recent.length === 0) {
            store.delete(userIdentifier);
        }
        store.set(userIdentifier, recent);
        return recent;
    }
}
