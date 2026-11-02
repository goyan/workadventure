import type { Application, NextFunction, Request, Response } from "express";
import { z } from "zod";
import { ADMIN_API_TOKEN, ADMIN_API_URL } from "../enums/EnvironmentVariable";
import { getClientIpFromXForwardedFor } from "../services/ClientIp";
import { jwtTokenManager } from "../services/JWTTokenManager";
import { NpcRegisterService, NpcRegistrationRequest } from "../services/NpcRegisterService";
import { validatePostQuery } from "../services/QueryValidator";
import { BaseHttpController } from "./BaseHttpController";

export class NpcRegisterController extends BaseHttpController {
    private readonly service: NpcRegisterService | undefined;

    public constructor(app: Application, service?: NpcRegisterService) {
        super(app);
        this.service =
            service ??
            (ADMIN_API_URL && ADMIN_API_TOKEN
                ? new NpcRegisterService({ adminApiUrl: ADMIN_API_URL, authorization: ADMIN_API_TOKEN })
                : undefined);
    }

    protected routes(): void {
        this.app.post("/register", async (req: Request, res: Response) => {
            res.setHeader("Cache-Control", "no-store");
            if (!this.service) {
                res.status(503).json({ error: "unavailable" });
                return;
            }
            // Use the same trusted proxy header as the existing authentication routes.
            const ip = getClientIpFromXForwardedFor(req.header("x-forwarded-for")) || req.ip || "";
            if (!this.service.acceptRequest(ip)) {
                res.status(429).json({ error: "rate-limit" });
                return;
            }
            const body = validatePostQuery(req, res, NpcRegistrationRequest);
            if (body === undefined) return;
            const result = await this.service.register(body);
            if (result.status !== "ok") {
                res.status(result.status === "forbidden" ? 403 : 503).json({ error: result.status });
                return;
            }
            try {
                // No OIDC access token or tags: room access is recalculated by the Admin API.
                const authToken = await jwtTokenManager.createAuthToken(result.userUuid);
                res.json({ authToken, userUuid: result.userUuid, roomUrl: result.roomUrl });
            } catch {
                // This authentication boundary never logs a request body, invitation or JWT.
                res.status(503).json({ error: "unavailable" });
            }
        });
        // express.json() errors can carry the raw invitation body. Stop them before the global error logger.
        this.app.use("/register", (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
            const malformed = z.object({ status: z.union([z.literal(400), z.literal(413)]) }).safeParse(error).success;
            res.setHeader("Cache-Control", "no-store");
            res.status(malformed ? 400 : 503).json({ error: malformed ? "invalid" : "unavailable" });
        });
    }
}
