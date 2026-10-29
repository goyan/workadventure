import { z } from "zod";
import type { Request, Response } from "express";
import Debug from "debug";
import * as Sentry from "@sentry/node";
import {
    ADMIN_API_TOKEN,
    ADMIN_API_URL,
    MAP_CREATION_MAX_PER_USER_PER_HOUR,
    MAP_CREATION_TAG,
    INTERNAL_MAP_STORAGE_URL,
    PUSHER_URL,
} from "../enums/EnvironmentVariable";
import type { ResponseWithUserIdentifier } from "../middlewares/Authenticated";
import { authenticated } from "../middlewares/Authenticated";
import { adminService } from "../services/AdminService";
import { jwtTokenManager } from "../services/JWTTokenManager";
import {
    isCreationAllowed,
    MapCreationError,
    MapCreationService,
    readMapCreationConfig,
} from "../services/MapCreationService";
import type { MapCreationErrorCode } from "../services/MapCreationService";
import { validatePostQuery, validateQuery } from "../services/QueryValidator";
import { BaseHttpController } from "./BaseHttpController";

const debug = Debug("pusher:requests");

const HTTP_STATUS_BY_ERROR: Record<MapCreationErrorCode, number> = {
    "invalid-name": 400,
    forbidden: 403,
    "rate-limit": 429,
    "quota-total": 429,
    "storage-failure": 502,
};

export class MapCreationController extends BaseHttpController {
    private readonly service: MapCreationService | undefined;
    private readonly creatorTag: string;

    constructor(app: ConstructorParameters<typeof BaseHttpController>[0]) {
        super(app);
        const config = readMapCreationConfig({
            creatorTag: MAP_CREATION_TAG,
            maxPerUserPerHour: MAP_CREATION_MAX_PER_USER_PER_HOUR,
            adminApiUrl: ADMIN_API_URL,
            adminApiToken: ADMIN_API_TOKEN,
            mapStorageUrl: INTERNAL_MAP_STORAGE_URL,
            production: process.env.NODE_ENV === "production",
        });
        this.service = config ? new MapCreationService(config) : undefined;
        this.creatorTag = config?.creatorTag ?? MAP_CREATION_TAG;
    }

    routes(): void {
        this.app.options("/map-creation", (req: Request, res: Response) => {
            res.status(200).send("");
        });

        // Tells the map editor whether to show the "create a map" button. Nothing here grants anything.
        this.app.get("/map-creation", [authenticated], async (req: Request, res: ResponseWithUserIdentifier) => {
            const query = validateQuery(req, res, z.object({ roomUrl: z.string() }));
            if (query === undefined || !this.acceptQuery(res)) {
                return;
            }
            res.json({ allowed: await this.isAllowed(req, res, query.roomUrl) });
        });

        this.app.post("/map-creation", [authenticated], async (req: Request, res: ResponseWithUserIdentifier) => {
            debug(`MapCreationController => [${req.method}] ${req.originalUrl} — IP: ${req.ip} — Time: ${Date.now()}`);
            const body = validatePostQuery(req, res, z.object({ name: z.string(), roomUrl: z.string() }));
            if (body === undefined || !res.userIdentifier) {
                return;
            }
            if (this.service === undefined) {
                res.status(404).json({ error: "disabled" });
                return;
            }
            if (!this.acceptQuery(res)) {
                return;
            }
            // The right is recomputed on the server from the Admin API: nothing sent by the browser is trusted.
            if (!(await this.isAllowed(req, res, body.roomUrl))) {
                res.status(403).json({ error: "forbidden" });
                return;
            }
            try {
                res.status(201).json(await this.service.createMap(res.userIdentifier, body.name));
            } catch (e) {
                if (e instanceof MapCreationError) {
                    if (e.code === "storage-failure") {
                        // The error was sanitized by the service: no request configuration, so no token.
                        console.error("Map creation failed:", e.message);
                        Sentry.captureException(e);
                    }
                    res.status(HTTP_STATUS_BY_ERROR[e.code]).json({ error: e.code });
                    return;
                }
                // Never log the raw error: a network library error can carry the request configuration.
                console.error("Map creation failed unexpectedly:", e instanceof Error ? e.message : "unknown error");
                res.status(500).json({ error: "internal" });
            }
        });
    }

    /** Answers 429 and returns false when the user asks too often: every query reaches the Admin API and map-storage. */
    private acceptQuery(res: ResponseWithUserIdentifier): boolean {
        if (this.service === undefined || !res.userIdentifier) {
            return true;
        }
        try {
            this.service.assertQueryWithinRate(res.userIdentifier);
            return true;
        } catch {
            res.status(429).json({ error: "rate-limit" });
            return false;
        }
    }

    private async isAllowed(req: Request, res: ResponseWithUserIdentifier, roomUrl: string): Promise<boolean> {
        const service = this.service;
        const userIdentifier = res.userIdentifier;
        if (service === undefined || !userIdentifier) {
            return false;
        }
        try {
            const jwtData = await jwtTokenManager.verifyJWTToken(req.header("authorization") ?? "");
            return await isCreationAllowed(roomUrl, PUSHER_URL, this.creatorTag, {
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
                    return member.status === "error"
                        ? undefined
                        : { canEdit: member.canEdit ?? false, tags: member.tags };
                },
                roomExists: (roomPath) => service.roomExists(roomPath),
            });
        } catch (e) {
            console.error("Cannot check the map creation right:", e instanceof Error ? e.message : "unknown error");
            return false;
        }
    }
}
