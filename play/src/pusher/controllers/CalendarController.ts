import { z } from "zod";
import type { Request, Response } from "express";
import * as Sentry from "@sentry/node";
import { asError } from "catch-unknown";
import { ADMIN_API_TOKEN, ADMIN_API_URL } from "../enums/EnvironmentVariable";
import type { ResponseWithUserIdentifier } from "../middlewares/Authenticated";
import { authenticated } from "../middlewares/Authenticated";
import { CalendarError, CalendarService, canUseCalendars, readCalendarConfig } from "../services/CalendarService";
import type { CalendarErrorCode } from "../services/CalendarService";
import { validatePostQuery, validateQuery } from "../services/QueryValidator";
import { BaseHttpController } from "./BaseHttpController";

const HTTP_STATUS_BY_ERROR: Record<CalendarErrorCode, number> = {
    invalid: 400,
    "not-found": 404,
    quota: 409,
    unreachable: 422,
    "rate-limit": 429,
    unavailable: 502,
};

/**
 * The Outlook calendars (published ICS links) of the authenticated user, kept by the Admin API: list, add, delete,
 * and the events of a time window. Each user only ever reaches their own calendars.
 */
export class CalendarController extends BaseHttpController {
    private readonly service: CalendarService | undefined;

    constructor(app: ConstructorParameters<typeof BaseHttpController>[0]) {
        super(app);
        const config = readCalendarConfig({ adminApiUrl: ADMIN_API_URL, adminApiToken: ADMIN_API_TOKEN });
        this.service = config ? new CalendarService(config) : undefined;
    }

    routes(): void {
        for (const path of ["/calendar/sources", "/calendar/sources/:id", "/calendar/events"]) {
            this.app.options(path, (req: Request, res: Response) => {
                res.status(200).send("");
            });
        }

        this.app.get("/calendar/sources", [authenticated], async (req: Request, res: ResponseWithUserIdentifier) => {
            await this.handle(res, async (service, userIdentifier) => {
                res.json(await service.listSources(userIdentifier));
            });
        });

        this.app.post("/calendar/sources", [authenticated], async (req: Request, res: ResponseWithUserIdentifier) => {
            const body = validatePostQuery(req, res, z.object({ label: z.string(), url: z.string() }));
            if (body === undefined) {
                return;
            }
            await this.handle(res, async (service, userIdentifier) => {
                // The owner is the authenticated user: a userIdentifier sent by the browser is never read.
                res.status(201).json(await service.addSource(userIdentifier, body));
            });
        });

        this.app.delete(
            "/calendar/sources/:id",
            [authenticated],
            async (req: Request, res: ResponseWithUserIdentifier) => {
                const id: unknown = req.params.id;
                await this.handle(res, async (service, userIdentifier) => {
                    await service.deleteSource(userIdentifier, typeof id === "string" ? id : "");
                    res.status(204).send();
                });
            },
        );

        this.app.get("/calendar/events", [authenticated], async (req: Request, res: ResponseWithUserIdentifier) => {
            const query = validateQuery(req, res, z.object({ from: z.string(), to: z.string() }));
            if (query === undefined) {
                return;
            }
            await this.handle(res, async (service, userIdentifier) => {
                const from = new Date(query.from);
                const to = new Date(query.to);
                if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
                    throw new CalendarError("invalid", "The time window is invalid");
                }
                res.json(await service.events(userIdentifier, from, to));
            });
        });
    }

    /** Common path of every route: feature enabled, a person, not rate limited, then the action. */
    private async handle(
        res: ResponseWithUserIdentifier,
        action: (service: CalendarService, userIdentifier: string) => Promise<void>,
    ): Promise<void> {
        const userIdentifier = res.userIdentifier;
        if (!userIdentifier) {
            return;
        }
        if (this.service === undefined) {
            res.status(404).json({ error: "disabled" });
            return;
        }
        if (!canUseCalendars(userIdentifier)) {
            res.status(403).json({ error: "forbidden" });
            return;
        }
        try {
            this.service.assertQueryWithinRate(userIdentifier);
            await action(this.service, userIdentifier);
        } catch (e) {
            if (e instanceof CalendarError) {
                if (e.code === "unavailable") {
                    // The error was sanitized by the service: no request configuration, so no token.
                    console.error("Calendar request failed:", e.message);
                    Sentry.captureException(e);
                }
                res.status(HTTP_STATUS_BY_ERROR[e.code]).json({ error: e.code });
                return;
            }
            // Never log the raw error: a network library error can carry the request configuration.
            console.error("Calendar request failed unexpectedly:", asError(e).message);
            res.status(500).json({ error: "internal" });
        }
    }
}
