import type { AxiosInstance } from "axios";
import axios from "axios";
import { z } from "zod";
import {
    MAP_PATTERN_MAX_NAME_LENGTH,
    MapPatternDetail,
    MapPatternList,
    MapPatternPayload,
    MapPatternSummary,
} from "../../common/MapPattern";
import type {
    MapPatternDetailForClient,
    MapPatternListForClient,
    MapPatternSummaryForClient,
} from "../../common/MapPattern";
import { roomPathFromUrl } from "./MapCreationService";

const ONE_MINUTE_IN_MS = 60 * 1000;
const MAX_QUERIES_PER_MINUTE = 60;

export type MapPatternErrorCode = "invalid" | "forbidden" | "not-found" | "quota" | "rate-limit" | "unavailable";

export class MapPatternError extends Error {
    constructor(
        public readonly code: MapPatternErrorCode,
        message: string,
        options?: ErrorOptions,
    ) {
        super(message, options);
        this.name = "MapPatternError";
    }
}

export interface MapPatternConfig {
    adminApiUrl: string;
    /** Value of the Authorization header sent to the Admin API (ADMIN_API_TOKEN). */
    authorization: string;
}

/** Undefined means the feature is disabled: the patterns live in the Admin API. */
export function readMapPatternConfig(env: {
    adminApiUrl: string | undefined;
    adminApiToken: string | undefined;
}): MapPatternConfig | undefined {
    if (!env.adminApiUrl || !env.adminApiToken) {
        return undefined;
    }
    return { adminApiUrl: env.adminApiUrl.replace(/\/+$/, ""), authorization: env.adminApiToken };
}

export interface PatternRightDependencies {
    /** Right of the authenticated user, computed by the Admin API for this room. Undefined when it cannot be known. */
    fetchMember(trustedRoomUrl: string): Promise<{ canEdit: boolean; tags: string[] } | undefined>;
}

/** Tag of the Admin API that marks an administrator (same tag as the global messages of the pusher). */
export const ADMIN_TAG = "admin";

/** The author or an administrator. Computed on the server: the browser only receives the result. */
export function canDeletePattern(createdBy: string, userIdentifier: string, isAdmin: boolean): boolean {
    return isAdmin || createdBy === userIdentifier;
}

export interface PatternRight {
    isAdmin: boolean;
}

/**
 * The browser designates the room used as authorization context: it must be a room of this world, and the Admin API
 * must say that the user can edit it. Undefined means no right. Nothing sent by the browser is trusted as a right.
 */
export async function canManagePatterns(
    roomUrl: string,
    pusherUrl: string,
    dependencies: PatternRightDependencies,
): Promise<PatternRight | undefined> {
    const roomPath = roomPathFromUrl(roomUrl, pusherUrl);
    if (roomPath === undefined) {
        return undefined;
    }
    const member = await dependencies.fetchMember(new URL(`/~/${roomPath}`, pusherUrl).toString());
    if (member?.canEdit !== true) {
        return undefined;
    }
    return { isAdmin: member.tags.includes(ADMIN_TAG) };
}

const PatternId = z.string().uuid();
const PatternName = z.string().trim().min(1).max(MAP_PATTERN_MAX_NAME_LENGTH);

export class MapPatternService {
    private readonly recentQueries = new Map<string, number[]>();

    constructor(
        private readonly config: MapPatternConfig,
        private readonly http: AxiosInstance = axios,
        private readonly now: () => number = Date.now,
    ) {}

    /** Limits how often one user can ask: every query reaches the Admin API. */
    public assertQueryWithinRate(userIdentifier: string): void {
        const since = this.now() - ONE_MINUTE_IN_MS;
        const recent = (this.recentQueries.get(userIdentifier) ?? []).filter((time) => time > since);
        if (recent.length >= MAX_QUERIES_PER_MINUTE) {
            this.recentQueries.set(userIdentifier, recent);
            throw new MapPatternError("rate-limit", "Too many queries in the last minute");
        }
        recent.push(this.now());
        this.recentQueries.set(userIdentifier, recent);
    }

    public async list(userIdentifier: string, isAdmin: boolean): Promise<MapPatternListForClient> {
        const response = await this.callAdminApi(() =>
            this.http.get(`${this.config.adminApiUrl}/api/map-patterns`, this.requestOptions()),
        );
        if (response.status !== 200) {
            throw this.unexpectedStatus(response.status);
        }
        const list = this.parseResponse(MapPatternList, response.data);
        return { patterns: list.patterns.map((pattern) => this.toClient(pattern, userIdentifier, isAdmin)) };
    }

    public async get(id: string, userIdentifier: string, isAdmin: boolean): Promise<MapPatternDetailForClient> {
        const patternId = this.parseId(id);
        const response = await this.callAdminApi(() =>
            this.http.get(`${this.config.adminApiUrl}/api/map-patterns/${patternId}`, this.requestOptions()),
        );
        if (response.status === 404) {
            throw new MapPatternError("not-found", "The pattern does not exist");
        }
        if (response.status !== 200) {
            throw this.unexpectedStatus(response.status);
        }
        // The stored payload is validated again: it is sent to every editor, whatever wrote it.
        const detail = this.parseResponse(MapPatternDetail, response.data);
        return { ...this.toClient(detail, userIdentifier, isAdmin), payload: detail.payload };
    }

    /** The payload is validated BEFORE the call, and the author comes from the server, never from the browser. */
    public async create(
        userIdentifier: string,
        rawName: string,
        rawPayload: unknown,
        isAdmin: boolean,
    ): Promise<MapPatternSummaryForClient> {
        const name = PatternName.safeParse(rawName);
        const payload = MapPatternPayload.safeParse(rawPayload);
        if (!name.success || !payload.success) {
            throw new MapPatternError("invalid", "The pattern name or payload is invalid");
        }
        const response = await this.callAdminApi(() =>
            this.http.post(
                `${this.config.adminApiUrl}/api/map-patterns`,
                { name: name.data, payload: payload.data, userIdentifier },
                this.requestOptions(),
            ),
        );
        switch (response.status) {
            case 201:
                return this.toClient(this.parseResponse(MapPatternSummary, response.data), userIdentifier, isAdmin);
            case 400:
                throw new MapPatternError("invalid", "The Admin API refused the pattern");
            case 409:
                throw new MapPatternError("quota", "The maximum number of patterns is reached");
            default:
                throw this.unexpectedStatus(response.status);
        }
    }

    /** `requestedBy` and `admin` come from the server: the Admin API refuses (403) anyone but the author or an admin. */
    public async delete(id: string, userIdentifier: string, isAdmin: boolean): Promise<void> {
        const patternId = this.parseId(id);
        const response = await this.callAdminApi(() =>
            this.http.delete(`${this.config.adminApiUrl}/api/map-patterns/${patternId}`, {
                ...this.requestOptions(),
                params: { requestedBy: userIdentifier, admin: isAdmin },
            }),
        );
        switch (response.status) {
            case 204:
                return;
            case 400:
                throw new MapPatternError("invalid", "The Admin API refused the deletion request");
            case 403:
                throw new MapPatternError("forbidden", "Only the author or an administrator can delete a pattern");
            case 404:
                throw new MapPatternError("not-found", "The pattern does not exist");
            default:
                throw this.unexpectedStatus(response.status);
        }
    }

    private toClient(pattern: MapPatternSummary, userIdentifier: string, isAdmin: boolean): MapPatternSummaryForClient {
        const { createdBy, ...visible } = pattern;
        return { ...visible, canDelete: canDeletePattern(createdBy, userIdentifier, isAdmin) };
    }

    /** Only a UUID can reach the Admin API URL: anything else cannot designate a pattern. */
    private parseId(id: string): string {
        const parsed = PatternId.safeParse(id);
        if (!parsed.success) {
            throw new MapPatternError("not-found", "The pattern does not exist");
        }
        return parsed.data;
    }

    private requestOptions() {
        return { headers: { Authorization: this.config.authorization }, timeout: 15_000, validateStatus: () => true };
    }

    private parseResponse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
        const parsed = schema.safeParse(data);
        if (!parsed.success) {
            throw new MapPatternError("unavailable", "The Admin API returned an unexpected pattern answer");
        }
        return parsed.data;
    }

    private unexpectedStatus(status: number): MapPatternError {
        return new MapPatternError("unavailable", `The Admin API refused the request (HTTP ${status})`);
    }

    /**
     * Network failures reject with an Axios error that carries the request configuration, so the Admin API token:
     * it is replaced by a sanitized error and never reaches a log or Sentry.
     */
    private async callAdminApi<T>(call: () => Promise<T>): Promise<T> {
        try {
            return await call();
        } catch (e) {
            const reason = axios.isAxiosError(e) ? (e.code ?? "network error") : "unexpected error";
            throw new MapPatternError("unavailable", "Admin API unreachable", { cause: new Error(reason) });
        }
    }
}
