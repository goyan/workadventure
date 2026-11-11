import { createHash } from "node:crypto";
import type { AxiosInstance } from "axios";
import axios from "axios";
import type { z } from "zod";
import {
    CompanionTokenInput,
    CompanionTokenList,
    CreatedCompanionToken,
    MeetingRoomClaim,
    MeetingRoomClaimInput,
    MeetingRoomList,
} from "../../common/MacCompanion";
import type { CalendarConfig } from "./CalendarService";

const ONE_MINUTE_IN_MS = 60 * 1000;
const MAX_UPLOADS_PER_MINUTE = 30;
const MAX_QUERIES_PER_MINUTE = 60;
export const MAX_UPLOAD_BYTES = 64 * 1024;

export type MacCompanionErrorCode =
    | "invalid"
    | "not-found"
    | "quota"
    | "unauthorized"
    | "forbidden"
    | "disabled"
    | "too-large"
    | "rate-limit"
    | "unavailable";

export class MacCompanionError extends Error {
    constructor(
        public readonly code: MacCompanionErrorCode,
        message: string,
        options?: ErrorOptions,
    ) {
        super(message, options);
        this.name = "MacCompanionError";
    }
}

/**
 * Relays the Mac companion and the Teams meeting rooms to the Admin API. Uploads are authenticated by the companion
 * token alone (the companion has no WorkAdventure session); every other call acts for the user of the checked
 * WorkAdventure token, never for a user named in the request.
 */
export class MacCompanionService {
    private readonly recentQueries = new Map<string, number[]>();
    private nextRateCleanupAt = 0;

    constructor(
        private readonly config: CalendarConfig,
        // Own instance: the Room API installs a 5 minute GET cache on the default axios instance (AdminAuthenticator).
        private readonly http: AxiosInstance = axios.create(),
        private readonly now: () => number = Date.now,
    ) {}

    public assertQueryWithinRate(key: string, limit = MAX_QUERIES_PER_MINUTE): void {
        const now = this.now();
        const since = now - ONE_MINUTE_IN_MS;
        if (now >= this.nextRateCleanupAt) {
            for (const [user, times] of this.recentQueries) {
                if ((times[times.length - 1] ?? 0) <= since) this.recentQueries.delete(user);
            }
            this.nextRateCleanupAt = now + ONE_MINUTE_IN_MS;
        }
        const recent = (this.recentQueries.get(key) ?? []).filter((time) => time > since);
        if (recent.length >= limit) {
            this.recentQueries.set(key, recent);
            throw new MacCompanionError("rate-limit", "Too many queries in the last minute");
        }
        this.recentQueries.set(key, [...recent, now]);
    }

    /** `size`: length of the request body in bytes, checked before anything else. */
    public async uploadMeetings(companionToken: string, body: unknown, size: number): Promise<void> {
        if (size > MAX_UPLOAD_BYTES) {
            throw new MacCompanionError("too-large", "The meetings upload is too large");
        }
        // Keyed by a hash: the token itself is kept nowhere in the pusher.
        this.assertQueryWithinRate(
            `upload:${createHash("sha256").update(companionToken).digest("hex")}`,
            MAX_UPLOADS_PER_MINUTE,
        );
        const response = await this.callAdminApi(() =>
            this.http.put(`${this.config.adminApiUrl}/api/companion/meetings`, body, {
                ...this.requestOptions(),
                headers: { Authorization: this.config.authorization, "X-Companion-Token": companionToken },
            }),
        );
        switch (response.status) {
            case 204:
                return;
            case 400:
                throw new MacCompanionError("invalid", "The Admin API refused the meetings");
            case 401:
                throw new MacCompanionError("unauthorized", "The companion token is unknown or revoked");
            case 404:
                throw new MacCompanionError("disabled", "The Mac companion is disabled");
            default:
                throw this.unexpectedStatus(response.status);
        }
    }

    public async listTokens(userIdentifier: string): Promise<CompanionTokenList> {
        const response = await this.callAdminApi(() =>
            this.http.get(`${this.config.adminApiUrl}/api/companion/tokens`, {
                ...this.requestOptions(),
                params: { userIdentifier },
            }),
        );
        if (response.status === 404) throw new MacCompanionError("disabled", "The Mac companion is disabled");
        if (response.status !== 200) throw this.unexpectedStatus(response.status);
        return this.parseResponse(CompanionTokenList, response.data);
    }

    public async createToken(userIdentifier: string, rawInput: unknown): Promise<CreatedCompanionToken> {
        const input = CompanionTokenInput.safeParse(rawInput);
        if (!input.success) throw new MacCompanionError("invalid", "The token label is invalid");
        const response = await this.callAdminApi(() =>
            this.http.post(
                `${this.config.adminApiUrl}/api/companion/tokens`,
                { userIdentifier, label: input.data.label },
                this.requestOptions(),
            ),
        );
        switch (response.status) {
            case 201:
                return this.parseResponse(CreatedCompanionToken, response.data);
            case 400:
                throw new MacCompanionError("invalid", "The Admin API refused the token label");
            case 404:
                throw new MacCompanionError("disabled", "The Mac companion is disabled");
            case 409:
                throw new MacCompanionError("quota", "The maximum number of tokens is reached");
            default:
                throw this.unexpectedStatus(response.status);
        }
    }

    public async deleteToken(userIdentifier: string, id: string): Promise<void> {
        const response = await this.callAdminApi(() =>
            this.http.delete(`${this.config.adminApiUrl}/api/companion/tokens/${encodeURIComponent(id)}`, {
                ...this.requestOptions(),
                params: { userIdentifier },
            }),
        );
        switch (response.status) {
            case 204:
                return;
            case 400:
            case 404:
                throw new MacCompanionError("not-found", "The token does not exist");
            default:
                throw this.unexpectedStatus(response.status);
        }
    }

    public async claimRoom(userIdentifier: string, rawInput: unknown): Promise<MeetingRoomClaim> {
        const input = MeetingRoomClaimInput.safeParse(rawInput);
        if (!input.success) throw new MacCompanionError("invalid", "The room claim is invalid");
        const response = await this.callAdminApi(() =>
            this.http.post(
                `${this.config.adminApiUrl}/api/meeting-rooms/claim`,
                { userIdentifier, ...input.data },
                this.requestOptions(),
            ),
        );
        switch (response.status) {
            case 200:
                return this.parseResponse(MeetingRoomClaim, response.data);
            case 400:
                throw new MacCompanionError("invalid", "The Admin API refused the room claim");
            case 403:
                throw new MacCompanionError("forbidden", "The user is not invited to this meeting");
            case 404:
                throw new MacCompanionError("disabled", "The Mac companion is disabled");
            default:
                throw this.unexpectedStatus(response.status);
        }
    }

    public async listRooms(mapUrl: string): Promise<MeetingRoomList> {
        const response = await this.callAdminApi(() =>
            this.http.get(`${this.config.adminApiUrl}/api/meeting-rooms`, {
                ...this.requestOptions(),
                params: { mapUrl },
            }),
        );
        if (response.status === 404) throw new MacCompanionError("disabled", "The Mac companion is disabled");
        if (response.status === 400) throw new MacCompanionError("invalid", "The map is invalid");
        if (response.status !== 200) throw this.unexpectedStatus(response.status);
        // Parsed again: only the room, the title and the end reach the players.
        return this.parseResponse(MeetingRoomList, response.data);
    }

    private requestOptions() {
        return { headers: { Authorization: this.config.authorization }, timeout: 15_000, validateStatus: () => true };
    }

    private parseResponse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
        const parsed = schema.safeParse(data);
        if (!parsed.success) {
            throw new MacCompanionError("unavailable", "The Admin API returned an unexpected answer");
        }
        return parsed.data;
    }

    private unexpectedStatus(status: number): MacCompanionError {
        return new MacCompanionError("unavailable", `The Admin API refused the request (HTTP ${status})`);
    }

    /** A network error carries the request configuration, so the tokens: it is replaced by a sanitized error. */
    private async callAdminApi<T>(call: () => Promise<T>): Promise<T> {
        try {
            return await call();
        } catch (e) {
            const reason = axios.isAxiosError(e) ? (e.code ?? "network error") : "unexpected error";
            throw new MacCompanionError("unavailable", "Admin API unreachable", { cause: new Error(reason) });
        }
    }
}
