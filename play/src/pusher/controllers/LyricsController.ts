import type { Application, Request } from "express";
import { RateLimiter } from "limiter";
import { z } from "zod";
import { LyricsTrackSchema } from "../../common/Lyrics";
import { authenticated } from "../middlewares/Authenticated";
import type { ResponseWithUserIdentifier } from "../middlewares/Authenticated";
import { LyricsService } from "../services/LyricsService";
import { validateQuery } from "../services/QueryValidator";
import { BaseHttpController } from "./BaseHttpController";

const LyricsQuery = LyricsTrackSchema.extend({
    durationMs: z.preprocess(
        (value) => (typeof value === "string" ? Number(value) : value),
        LyricsTrackSchema.shape.durationMs,
    ),
});

export class LyricsController extends BaseHttpController {
    private readonly clients = new Map<string, { limiter: RateLimiter; at: number }>();

    public constructor(
        app: Application,
        private readonly service: Pick<LyricsService, "get"> = new LyricsService(),
    ) {
        super(app);
    }

    public routes(): void {
        this.app.get("/lyrics", [authenticated], async (req: Request, res: ResponseWithUserIdentifier) => {
            if (!res.userIdentifier) return;
            const query = validateQuery(req, res, LyricsQuery);
            if (!query) return;
            const now = Date.now();
            for (const [id, client] of this.clients) {
                if (now - client.at > 60_000) this.clients.delete(id);
            }
            let client = this.clients.get(res.userIdentifier);
            if (!client) {
                if (this.clients.size >= 4096) {
                    res.setHeader("Retry-After", "60");
                    res.status(429).json({ error: "limited" });
                    return;
                }
                client = { limiter: new RateLimiter({ tokensPerInterval: 30, interval: "minute" }), at: now };
                this.clients.set(res.userIdentifier, client);
            }
            client.at = now;
            if (!client.limiter.tryRemoveTokens(1)) {
                res.setHeader("Retry-After", "60");
                res.status(429).json({ error: "limited" });
                return;
            }
            const result = await this.service.get(query);
            if (res.destroyed) return;
            res.setHeader("Cache-Control", "private, no-store");
            if (result.status === "limited") {
                res.setHeader("Retry-After", String(Math.ceil(result.retryAfterMs / 1000)));
                res.status(429).json({ error: "limited" });
            } else if (result.status === "unavailable") {
                res.status(502).json({ error: "unavailable" });
            } else {
                res.json(result);
            }
        });
    }
}
