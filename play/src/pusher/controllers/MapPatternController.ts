import { z } from "zod";
import type { Request, Response } from "express";
import * as Sentry from "@sentry/node";
import { ADMIN_API_TOKEN, ADMIN_API_URL, PUSHER_URL } from "../enums/EnvironmentVariable";
import type { ResponseWithUserIdentifier } from "../middlewares/Authenticated";
import { authenticated } from "../middlewares/Authenticated";
import { adminService } from "../services/AdminService";
import { jwtTokenManager } from "../services/JWTTokenManager";
import {
    canManagePatterns,
    MapPatternError,
    MapPatternService,
    readMapPatternConfig,
} from "../services/MapPatternService";
import type { MapPatternErrorCode } from "../services/MapPatternService";
import { validatePostQuery, validateQuery } from "../services/QueryValidator";
import { BaseHttpController } from "./BaseHttpController";

const HTTP_STATUS_BY_ERROR: Record<MapPatternErrorCode, number> = {
    invalid: 400,
    "not-found": 404,
    quota: 409,
    "rate-limit": 429,
    unavailable: 502,
};

export class MapPatternController extends BaseHttpController {
    private readonly service: MapPatternService | undefined;

    constructor(app: ConstructorParameters<typeof BaseHttpController>[0]) {
        super(app);
        const config = readMapPatternConfig({ adminApiUrl: ADMIN_API_URL, adminApiToken: ADMIN_API_TOKEN });
        this.service = config ? new MapPatternService(config) : undefined;
    }

    routes(): void {
        this.app.options("/map-patterns", (req: Request, res: Response) => {
            res.status(200).send("");
        });
        this.app.options("/map-patterns/:id", (req: Request, res: Response) => {
            res.status(200).send("");
        });

        this.app.get("/map-patterns", [authenticated], async (req: Request, res: ResponseWithUserIdentifier) => {
            const query = validateQuery(req, res, z.object({ roomUrl: z.string() }));
            if (query === undefined) {
                return;
            }
            await this.handle(req, res, query.roomUrl, async (service) => {
                res.json(await service.list());
            });
        });

        this.app.get("/map-patterns/:id", [authenticated], async (req: Request, res: ResponseWithUserIdentifier) => {
            const query = validateQuery(req, res, z.object({ roomUrl: z.string() }));
            if (query === undefined) {
                return;
            }
            await this.handle(req, res, query.roomUrl, async (service) => {
                res.json(await service.get(this.readPatternId(req)));
            });
        });

        this.app.post("/map-patterns", [authenticated], async (req: Request, res: ResponseWithUserIdentifier) => {
            const body = validatePostQuery(
                req,
                res,
                z.object({ roomUrl: z.string(), name: z.string(), payload: z.unknown() }),
            );
            if (body === undefined) {
                return;
            }
            await this.handle(req, res, body.roomUrl, async (service, userIdentifier) => {
                // The author is the authenticated user: a userIdentifier sent by the browser is never read.
                res.status(201).json(await service.create(userIdentifier, body.name, body.payload));
            });
        });

        this.app.delete("/map-patterns/:id", [authenticated], async (req: Request, res: ResponseWithUserIdentifier) => {
            const query = validateQuery(req, res, z.object({ roomUrl: z.string() }));
            if (query === undefined) {
                return;
            }
            await this.handle(req, res, query.roomUrl, async (service) => {
                await service.delete(this.readPatternId(req));
                res.status(204).send();
            });
        });
    }

    /** An id that is not a plain string cannot designate a pattern: the service answers not-found for it. */
    private readPatternId(req: Request): string {
        const id: unknown = req.params.id;
        return typeof id === "string" ? id : "";
    }

    /**
     * Common path of every route: feature enabled, user not rate limited, right recomputed on the server for the
     * designated room, then the action. Service errors are mapped to their HTTP status.
     */
    private async handle(
        req: Request,
        res: ResponseWithUserIdentifier,
        roomUrl: string,
        action: (service: MapPatternService, userIdentifier: string) => Promise<void>,
    ): Promise<void> {
        const userIdentifier = res.userIdentifier;
        if (!userIdentifier) {
            return;
        }
        if (this.service === undefined) {
            res.status(404).json({ error: "disabled" });
            return;
        }
        try {
            this.service.assertQueryWithinRate(userIdentifier);
            if (!(await this.isAllowed(req, userIdentifier, roomUrl))) {
                res.status(403).json({ error: "forbidden" });
                return;
            }
            await action(this.service, userIdentifier);
        } catch (e) {
            if (e instanceof MapPatternError) {
                if (e.code === "unavailable") {
                    // The error was sanitized by the service: no request configuration, so no token.
                    console.error("Map pattern request failed:", e.message);
                    Sentry.captureException(e);
                }
                res.status(HTTP_STATUS_BY_ERROR[e.code]).json({ error: e.code });
                return;
            }
            // Never log the raw error: a network library error can carry the request configuration.
            console.error("Map pattern request failed unexpectedly:", e instanceof Error ? e.message : "unknown error");
            res.status(500).json({ error: "internal" });
        }
    }

    private async isAllowed(req: Request, userIdentifier: string, roomUrl: string): Promise<boolean> {
        try {
            const jwtData = await jwtTokenManager.verifyJWTToken(req.header("authorization") ?? "");
            return await canManagePatterns(roomUrl, PUSHER_URL, {
                fetchMember: async (trustedRoomUrl) => {
                    const member = await adminService.fetchMemberDataByUuid(
                        userIdentifier,
                        jwtData.accessToken,
                        trustedRoomUrl,
                        req.ip ?? "",
                        [],
                        undefined,
                        req.header("accept-language"),
                        jwtData.tags,
                    );
                    return member.status === "error" ? undefined : { canEdit: member.canEdit ?? false };
                },
            });
        } catch (e) {
            console.error("Cannot check the map pattern right:", e instanceof Error ? e.message : "unknown error");
            return false;
        }
    }
}
