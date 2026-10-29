import { randomBytes } from "node:crypto";
import type { AxiosInstance } from "axios";
import axios from "axios";
import { MapsCacheFileFormat } from "@workadventure/map-editor";

/** Every map created from the map editor lives in a folder starting with this prefix: it is how they are counted. */
const CREATED_MAP_FOLDER_PREFIX = "carte-";
const MAX_NAME_LENGTH = 60;
const MAX_SLUG_LENGTH = 30;
const MAX_COPY_ATTEMPTS = 3;
const ONE_HOUR_IN_MS = 60 * 60 * 1000;
const ONE_MINUTE_IN_MS = 60 * 1000;
const MAX_QUERIES_PER_MINUTE = 30;

type MapCreationErrorCode = "invalid-name" | "rate-limit" | "quota-total" | "storage-failure";

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
    /** Folder of map-storage copied for every new map. Never comes from a client. */
    template: string;
    /** Tag required to create a map, or "*" for every user who can edit the map (development only). */
    creatorTag: string;
    maxTotal: number;
    maxPerUserPerHour: number;
    /** Internal URL of map-storage, without the public path prefix. */
    mapStorageUrl: string;
    /** Value of the Authorization header sent to map-storage. */
    authorization: string;
}

interface MapCreationEnvironment {
    template: string | undefined;
    creatorTag: string;
    maxTotal: number;
    maxPerUserPerHour: number;
    mapStorageUrl: string | undefined;
    /** True when the pusher runs in production: the "*" wildcard tag is then refused. */
    production: boolean;
    bearerToken: string | undefined;
    user: string | undefined;
    password: string | undefined;
}

/**
 * Undefined means the feature is disabled: it needs a template, an internal map-storage URL and a write credential.
 * A bearer token wins over the Basic credentials.
 */
export function readMapCreationConfig(env: MapCreationEnvironment): MapCreationConfig | undefined {
    if (!env.template || !env.mapStorageUrl) {
        return undefined;
    }
    // "*" lets every editor create maps: a development convenience that must never reach production by mistake.
    if (env.creatorTag === "*" && env.production) {
        return undefined;
    }
    let authorization: string;
    if (env.bearerToken) {
        authorization = `Bearer ${env.bearerToken}`;
    } else if (env.user && env.password) {
        authorization = `Basic ${Buffer.from(`${env.user}:${env.password}`).toString("base64")}`;
    } else {
        return undefined;
    }
    return {
        template: env.template,
        creatorTag: env.creatorTag,
        maxTotal: env.maxTotal,
        maxPerUserPerHour: env.maxPerUserPerHour,
        mapStorageUrl: env.mapStorageUrl.replace(/\/+$/, ""),
        authorization,
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

/** Lowercase ASCII letters, digits and single dashes only: the name is never used as a path. */
export function slugifyMapName(name: string): string {
    const slug = name
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, MAX_SLUG_LENGTH)
        .replace(/-+$/g, "");
    return slug === "" ? "bureau" : slug;
}

export class MapCreationService {
    private readonly recentCreations = new Map<string, number[]>();
    private readonly recentQueries = new Map<string, number[]>();
    /** Creations started and not finished: counted against the total limit before map-storage lists them. */
    private creationsInFlight = 0;

    constructor(
        private readonly config: MapCreationConfig,
        private readonly http: AxiosInstance = axios,
        private readonly now: () => number = Date.now,
        private readonly randomSuffix: () => string = () => randomBytes(3).toString("hex"),
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
     * Creates a folder copied from the template and returns the room URL to use in an exit.
     * Both limits are reserved BEFORE the first await, so parallel requests cannot all pass the same check.
     */
    public async createMap(userIdentifier: string, rawName: string): Promise<{ folder: string; roomUrl: string }> {
        const name = rawName.trim();
        if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
            throw new MapCreationError("invalid-name", `The name must have 1 to ${MAX_NAME_LENGTH} characters`);
        }
        const reservedAt = this.reserveUserSlot(userIdentifier);
        const othersInFlight = this.creationsInFlight;
        this.creationsInFlight++;
        let succeeded = false;
        try {
            if ((await this.countCreatedMaps()) + othersInFlight >= this.config.maxTotal) {
                throw new MapCreationError("quota-total", "The maximum number of created maps is reached");
            }
            const created = await this.copyTemplate(slugifyMapName(name), MAX_COPY_ATTEMPTS);
            succeeded = true;
            return created;
        } finally {
            this.creationsInFlight--;
            if (!succeeded) {
                this.releaseUserSlot(userIdentifier, reservedAt);
            }
        }
    }

    /** Copies the template into a new folder; on a name collision (409) tries again with another suffix. */
    private async copyTemplate(slug: string, attemptsLeft: number): Promise<{ folder: string; roomUrl: string }> {
        if (attemptsLeft === 0) {
            throw new MapCreationError("storage-failure", "No free folder name found");
        }
        const folder = `${CREATED_MAP_FOLDER_PREFIX}${slug}-${this.randomSuffix()}`;
        const response = await this.callMapStorage(() =>
            this.http.post(
                `${this.config.mapStorageUrl}/copy`,
                { source: this.config.template, destination: folder },
                {
                    headers: { Authorization: this.config.authorization },
                    timeout: 15_000,
                    validateStatus: () => true,
                },
            ),
        );
        if (response.status === 201) {
            return { folder, roomUrl: `/~/${folder}/office.wam` };
        }
        if (response.status !== 409) {
            throw new MapCreationError("storage-failure", `map-storage refused the copy (HTTP ${response.status})`);
        }
        return this.copyTemplate(slug, attemptsLeft - 1);
    }

    /** True when the room is a map served by map-storage: the authorization context cannot be an arbitrary URL. */
    public async roomExists(roomPath: string): Promise<boolean> {
        return (await this.listMapPaths()).includes(roomPath);
    }

    private async countCreatedMaps(): Promise<number> {
        return (await this.listMapPaths()).filter((path) => path.startsWith(CREATED_MAP_FOLDER_PREFIX)).length;
    }

    private async listMapPaths(): Promise<string[]> {
        const response = await this.callMapStorage(() =>
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
     * configuration, so the write credential: it is replaced by a sanitized error and never reaches a log or Sentry.
     */
    private async callMapStorage<T>(call: () => Promise<T>): Promise<T> {
        try {
            return await call();
        } catch (e) {
            const reason = axios.isAxiosError(e) ? (e.code ?? "network error") : "unexpected error";
            throw new MapCreationError("storage-failure", "map-storage unreachable", { cause: new Error(reason) });
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
