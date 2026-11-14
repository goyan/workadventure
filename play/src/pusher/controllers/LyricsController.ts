import type { Application, Request } from "express";
import { z } from "zod";
import { LyricsTrackSchema } from "../../common/Lyrics";
import { authenticated } from "../middlewares/Authenticated";
import type { ResponseWithUserIdentifier } from "../middlewares/Authenticated";
import { LyricsService } from "../services/LyricsService";
import { PerUserRateLimiter } from "../services/PerUserRateLimiter";
import { validateQuery } from "../services/QueryValidator";
import { BaseHttpController } from "./BaseHttpController";

const LyricsQuery = LyricsTrackSchema.extend({
    durationMs: z.preprocess(
        (value) => (typeof value === "string" ? Number(value) : value),
        LyricsTrackSchema.shape.durationMs,
    ),
});

export class LyricsController extends BaseHttpController {
    private readonly limiter = new PerUserRateLimiter(30);

    public constructor(
        app: Application,
        private readonly service: Pick<LyricsService, "get"> = new LyricsService(),
    ) {
        super(app);
    }

    public routes(): void {
        this.app.get("/lyrics", [authenticated], async (req: Request, res: ResponseWithUserIdentifier) => {
            const query = validateQuery(req, res, LyricsQuery);
            if (!query) return;
            if (!this.limiter.allow(res)) return;
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
