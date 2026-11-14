import type { Application, Request } from "express";
import { RateLimiter } from "limiter";
import { z } from "zod";
import { WeatherLocation } from "@workadventure/map-editor";
import { authenticated } from "../middlewares/Authenticated";
import type { ResponseWithUserIdentifier } from "../middlewares/Authenticated";
import { placeSearchService, realWeatherService } from "../services/RealWeatherService";
import type { PlaceSearchService, RealWeatherService } from "../services/RealWeatherService";
import { validateQuery } from "../services/QueryValidator";
import { BaseHttpController } from "./BaseHttpController";

const coordinate = (schema: z.ZodNumber) =>
    z.preprocess((value) => (typeof value === "string" && value !== "" ? Number(value) : value), schema.optional());
const WeatherQuery = z.object({
    latitude: coordinate(WeatherLocation.shape.latitude),
    longitude: coordinate(WeatherLocation.shape.longitude),
});
const PlacesQuery = z.object({ q: z.string().max(100) });

/**
 * The weather at the place of a map, and the towns to choose that place from. Only for players (each request may
 * cost a call to Open-Meteo, whose free service is limited), 30 requests a minute each.
 */
export class RealWeatherController extends BaseHttpController {
    private readonly clients = new Map<string, { limiter: RateLimiter; at: number }>();

    public constructor(
        app: Application,
        private readonly weather: Pick<RealWeatherService, "get"> = realWeatherService,
        private readonly places: Pick<PlaceSearchService, "search"> = placeSearchService,
    ) {
        super(app);
    }

    public routes(): void {
        this.app.get("/real-weather", [authenticated], async (req: Request, res: ResponseWithUserIdentifier) => {
            if (!this.allowed(res)) return;
            const query = validateQuery(req, res, WeatherQuery);
            if (!query) return;
            const { latitude, longitude } = query;
            const report = await this.weather.get(
                latitude !== undefined && longitude !== undefined ? { latitude, longitude } : undefined,
            );
            if (res.destroyed) return;
            res.setHeader("Cache-Control", "private, no-store");
            res.json(report);
        });

        this.app.get("/real-weather/places", [authenticated], async (req: Request, res: ResponseWithUserIdentifier) => {
            if (!this.allowed(res)) return;
            const query = validateQuery(req, res, PlacesQuery);
            if (!query) return;
            const places = await this.places.search(query.q);
            if (res.destroyed) return;
            res.setHeader("Cache-Control", "private, no-store");
            res.json(places);
        });
    }

    private allowed(res: ResponseWithUserIdentifier): boolean {
        if (!res.userIdentifier) return false;
        const now = Date.now();
        for (const [id, client] of this.clients) {
            if (now - client.at > 60_000) this.clients.delete(id);
        }
        let client = this.clients.get(res.userIdentifier);
        if (!client) {
            if (this.clients.size >= 4096) {
                res.setHeader("Retry-After", "60");
                res.status(429).json({ error: "limited" });
                return false;
            }
            client = { limiter: new RateLimiter({ tokensPerInterval: 30, interval: "minute" }), at: now };
            this.clients.set(res.userIdentifier, client);
        }
        client.at = now;
        if (!client.limiter.tryRemoveTokens(1)) {
            res.setHeader("Retry-After", "60");
            res.status(429).json({ error: "limited" });
            return false;
        }
        return true;
    }
}
