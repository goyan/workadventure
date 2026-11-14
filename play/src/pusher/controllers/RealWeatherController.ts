import type { Application, Request } from "express";
import { z } from "zod";
import { WeatherLocation } from "@workadventure/map-editor";
import { authenticated } from "../middlewares/Authenticated";
import type { ResponseWithUserIdentifier } from "../middlewares/Authenticated";
import { PerUserRateLimiter } from "../services/PerUserRateLimiter";
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
 * The weather timeline at the place of a map, and the towns to choose that place from. Only for players (each request may
 * cost a call to Open-Meteo, whose free service is limited), 30 requests a minute each.
 */
export class RealWeatherController extends BaseHttpController {
    private readonly limiter = new PerUserRateLimiter(30);

    public constructor(
        app: Application,
        private readonly weather: Pick<RealWeatherService, "get"> = realWeatherService,
        private readonly places: Pick<PlaceSearchService, "search"> = placeSearchService,
    ) {
        super(app);
    }

    public routes(): void {
        this.app.get("/real-weather", [authenticated], async (req: Request, res: ResponseWithUserIdentifier) => {
            const query = validateQuery(req, res, WeatherQuery);
            if (!query) return;
            if (!this.limiter.allow(res)) return;
            const { latitude, longitude } = query;
            const report = await this.weather.get(
                latitude !== undefined && longitude !== undefined ? { latitude, longitude } : undefined,
            );
            if (res.destroyed) return;
            res.setHeader("Cache-Control", "private, no-store");
            res.json(report);
        });

        this.app.get("/real-weather/places", [authenticated], async (req: Request, res: ResponseWithUserIdentifier) => {
            const query = validateQuery(req, res, PlacesQuery);
            if (!query) return;
            if (!this.limiter.allow(res)) return;
            const places = await this.places.search(query.q);
            if (res.destroyed) return;
            res.setHeader("Cache-Control", "private, no-store");
            // Unlike a town not found, the panel then says the search is unavailable.
            if (places === undefined) res.status(502).json({ error: "unavailable" });
            else res.json(places);
        });
    }
}
