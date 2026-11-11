import { z } from "zod";
import type { Request, Response } from "express";
import * as Sentry from "@sentry/node";
import { asError } from "catch-unknown";
import { ADMIN_API_TOKEN, ADMIN_API_URL } from "../enums/EnvironmentVariable";
import type { ResponseWithUserIdentifier } from "../middlewares/Authenticated";
import { authenticated } from "../middlewares/Authenticated";
import { canUseCalendars, readCalendarConfig } from "../services/CalendarService";
import { MacCompanionError, MacCompanionService } from "../services/MacCompanionService";
import type { MacCompanionErrorCode } from "../services/MacCompanionService";
import { validateQuery } from "../services/QueryValidator";
import { BaseHttpController } from "./BaseHttpController";

const HTTP_STATUS_BY_ERROR: Record<MacCompanionErrorCode, number> = {
    invalid: 400,
    unauthorized: 401,
    forbidden: 403,
    "not-found": 404,
    disabled: 404,
    quota: 409,
    "too-large": 413,
    "rate-limit": 429,
    unavailable: 502,
};

/**
 * The Mac companion (meetings read from the macOS Calendar, uploaded with a personal token) and the Teams meeting
 * rooms of a map. The upload is the only route without a WorkAdventure session: its personal token only lets its owner
 * replace their own meetings.
 */
export class MacCompanionController extends BaseHttpController {
    private readonly service: MacCompanionService | undefined;

    constructor(app: ConstructorParameters<typeof BaseHttpController>[0]) {
        super(app);
        const config = readCalendarConfig({ adminApiUrl: ADMIN_API_URL, adminApiToken: ADMIN_API_TOKEN });
        this.service = config ? new MacCompanionService(config) : undefined;
    }

    routes(): void {
        for (const path of ["/companion/tokens", "/companion/tokens/:id", "/meeting-rooms", "/meeting-rooms/claim"]) {
            this.app.options(path, (req: Request, res: Response) => {
                res.status(200).send("");
            });
        }

        this.app.put("/companion/meetings", async (req: Request, res: Response) => {
            const header = req.headers.authorization ?? "";
            const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
            if (!token) {
                res.status(401).json({ error: "unauthorized" });
                return;
            }
            const size = Number(req.headers["content-length"] ?? Buffer.byteLength(JSON.stringify(req.body ?? null)));
            await this.run(res, (service) =>
                service.uploadMeetings(token, req.body, size).then(() => res.status(204).send()),
            );
        });

        this.app.get("/companion/tokens", [authenticated], async (req: Request, res: ResponseWithUserIdentifier) => {
            await this.forUser(res, async (service, userIdentifier) => {
                res.json(await service.listTokens(userIdentifier));
            });
        });

        this.app.post("/companion/tokens", [authenticated], async (req: Request, res: ResponseWithUserIdentifier) => {
            await this.forUser(res, async (service, userIdentifier) => {
                res.status(201).json(await service.createToken(userIdentifier, req.body));
            });
        });

        this.app.delete(
            "/companion/tokens/:id",
            [authenticated],
            async (req: Request, res: ResponseWithUserIdentifier) => {
                const id: unknown = req.params.id;
                await this.forUser(res, async (service, userIdentifier) => {
                    await service.deleteToken(userIdentifier, typeof id === "string" ? id : "");
                    res.status(204).send();
                });
            },
        );

        this.app.post(
            "/meeting-rooms/claim",
            [authenticated],
            async (req: Request, res: ResponseWithUserIdentifier) => {
                await this.forUser(res, async (service, userIdentifier) => {
                    // The guest is the authenticated user: a userIdentifier sent by the browser is never read.
                    res.json(await service.claimRoom(userIdentifier, req.body));
                });
            },
        );

        this.app.get("/meeting-rooms", [authenticated], async (req: Request, res: ResponseWithUserIdentifier) => {
            const query = validateQuery(req, res, z.object({ mapUrl: z.string() }));
            if (query === undefined) {
                return;
            }
            await this.forUser(res, async (service) => {
                res.json(await service.listRooms(query.mapUrl));
            });
        });
    }

    /** Routes of a WorkAdventure session: a person (not an NPC), within the rate limit. */
    private async forUser(
        res: ResponseWithUserIdentifier,
        action: (service: MacCompanionService, userIdentifier: string) => Promise<void>,
    ): Promise<void> {
        const userIdentifier = res.userIdentifier;
        if (!userIdentifier) {
            return;
        }
        if (!canUseCalendars(userIdentifier)) {
            res.status(403).json({ error: "forbidden" });
            return;
        }
        await this.run(res, (service) => {
            service.assertQueryWithinRate(`user:${userIdentifier}`);
            return action(service, userIdentifier);
        });
    }

    private async run(res: Response, action: (service: MacCompanionService) => Promise<unknown>): Promise<void> {
        if (this.service === undefined) {
            res.status(404).json({ error: "disabled" });
            return;
        }
        try {
            await action(this.service);
        } catch (e) {
            if (e instanceof MacCompanionError) {
                if (e.code === "unavailable") {
                    // Sanitized by the service: no request configuration, so no token.
                    console.error("Mac companion request failed:", e.message);
                    Sentry.captureException(e);
                }
                res.status(HTTP_STATUS_BY_ERROR[e.code]).json({ error: e.code });
                return;
            }
            // Never log the raw error: a network library error can carry the request configuration.
            console.error("Mac companion request failed unexpectedly:", asError(e).message);
            res.status(500).json({ error: "internal" });
        }
    }
}
