import type { AxiosInstance } from "axios";
import axios from "axios";
import { z } from "zod";
import { CalendarEvents, CalendarSource, CalendarSourceInput, CalendarSourceList } from "../../common/Calendar";

const ONE_MINUTE_IN_MS = 60 * 1000;
const MAX_QUERIES_PER_MINUTE = 60;

export type CalendarErrorCode = "invalid" | "not-found" | "quota" | "unreachable" | "rate-limit" | "unavailable";

export class CalendarError extends Error {
    constructor(
        public readonly code: CalendarErrorCode,
        message: string,
        options?: ErrorOptions,
    ) {
        super(message, options);
        this.name = "CalendarError";
    }
}

export interface CalendarConfig {
    adminApiUrl: string;
    /** Value of the Authorization header sent to the Admin API (ADMIN_API_TOKEN). */
    authorization: string;
}

/** Undefined means the feature is disabled: the calendars live in the Admin API. */
export function readCalendarConfig(env: {
    adminApiUrl: string | undefined;
    adminApiToken: string | undefined;
}): CalendarConfig | undefined {
    if (!env.adminApiUrl || !env.adminApiToken) {
        return undefined;
    }
    return { adminApiUrl: env.adminApiUrl.replace(/\/+$/, ""), authorization: env.adminApiToken };
}

/** People only: the technical identities of the NPCs have no calendar. */
export function canUseCalendars(userIdentifier: string): boolean {
    return userIdentifier !== "" && !userIdentifier.startsWith("npc:");
}

const CalendarId = z.string().uuid();

/**
 * The Outlook calendars of each user, kept by the Admin API. The user is always the one of the token checked by the
 * pusher: nothing sent by the browser designates whose calendars are read or changed.
 */
export class CalendarService {
    private readonly recentQueries = new Map<string, number[]>();
    private nextRateCleanupAt = 0;

    constructor(
        private readonly config: CalendarConfig,
        // Own instance: the Room API installs a 5 minute GET cache on the default axios instance (AdminAuthenticator),
        // which would hide a calendar added in the meantime.
        private readonly http: AxiosInstance = axios.create(),
        private readonly now: () => number = Date.now,
    ) {}

    /** Limits how often one user can ask: every query reaches the Admin API. */
    public assertQueryWithinRate(userIdentifier: string): void {
        const now = this.now();
        const since = now - ONE_MINUTE_IN_MS;
        if (now >= this.nextRateCleanupAt) {
            for (const [user, times] of this.recentQueries) {
                if ((times[times.length - 1] ?? 0) <= since) this.recentQueries.delete(user);
            }
            this.nextRateCleanupAt = now + ONE_MINUTE_IN_MS;
        }
        const recent = (this.recentQueries.get(userIdentifier) ?? []).filter((time) => time > since);
        if (recent.length >= MAX_QUERIES_PER_MINUTE) {
            this.recentQueries.set(userIdentifier, recent);
            throw new CalendarError("rate-limit", "Too many queries in the last minute");
        }
        this.recentQueries.set(userIdentifier, [...recent, now]);
    }

    public async listSources(userIdentifier: string): Promise<CalendarSourceList> {
        const response = await this.callAdminApi(() =>
            this.http.get(`${this.config.adminApiUrl}/api/calendars`, {
                ...this.requestOptions(),
                params: { userIdentifier },
            }),
        );
        if (response.status !== 200) {
            throw this.unexpectedStatus(response.status);
        }
        return this.parseResponse(CalendarSourceList, response.data);
    }

    /** The link is checked again (host, reachability) by the Admin API, which alone fetches it. */
    public async addSource(userIdentifier: string, rawInput: unknown): Promise<CalendarSource> {
        const input = CalendarSourceInput.safeParse(rawInput);
        if (!input.success) {
            throw new CalendarError("invalid", "The calendar label or link is invalid");
        }
        const response = await this.callAdminApi(() =>
            this.http.post(
                `${this.config.adminApiUrl}/api/calendars`,
                { userIdentifier, label: input.data.label, url: input.data.url },
                this.requestOptions(),
            ),
        );
        switch (response.status) {
            case 201:
                return this.parseResponse(CalendarSource, response.data);
            case 400:
                throw new CalendarError("invalid", "The Admin API refused the calendar link");
            case 409:
                throw new CalendarError("quota", "The maximum number of calendars is reached");
            case 422:
                throw new CalendarError("unreachable", "The calendar link cannot be read");
            default:
                throw this.unexpectedStatus(response.status);
        }
    }

    public async deleteSource(userIdentifier: string, id: string): Promise<void> {
        const calendarId = CalendarId.safeParse(id);
        if (!calendarId.success) {
            throw new CalendarError("not-found", "The calendar does not exist");
        }
        const response = await this.callAdminApi(() =>
            this.http.delete(`${this.config.adminApiUrl}/api/calendars/${calendarId.data}`, {
                ...this.requestOptions(),
                params: { userIdentifier },
            }),
        );
        switch (response.status) {
            case 204:
                return;
            case 404:
                throw new CalendarError("not-found", "The calendar does not exist");
            default:
                throw this.unexpectedStatus(response.status);
        }
    }

    public async events(userIdentifier: string, from: Date, to: Date): Promise<CalendarEvents> {
        const response = await this.callAdminApi(() =>
            this.http.get(`${this.config.adminApiUrl}/api/calendar/events`, {
                ...this.requestOptions(),
                params: { userIdentifier, from: from.toISOString(), to: to.toISOString() },
            }),
        );
        if (response.status === 400) {
            throw new CalendarError("invalid", "The Admin API refused the time window");
        }
        if (response.status !== 200) {
            throw this.unexpectedStatus(response.status);
        }
        // Validated again: the join link is opened by the browser.
        return this.parseResponse(CalendarEvents, response.data);
    }

    private requestOptions() {
        return { headers: { Authorization: this.config.authorization }, timeout: 15_000, validateStatus: () => true };
    }

    private parseResponse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
        const parsed = schema.safeParse(data);
        if (!parsed.success) {
            throw new CalendarError("unavailable", "The Admin API returned an unexpected calendar answer");
        }
        return parsed.data;
    }

    private unexpectedStatus(status: number): CalendarError {
        return new CalendarError("unavailable", `The Admin API refused the request (HTTP ${status})`);
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
            throw new CalendarError("unavailable", "Admin API unreachable", { cause: new Error(reason) });
        }
    }
}
