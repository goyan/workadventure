import type { Server } from "node:http";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request } from "express";
import { WeatherType } from "@workadventure/map-editor";
import type { WeatherLocation } from "@workadventure/map-editor";
import type { ResponseWithUserIdentifier } from "../../src/pusher/middlewares/Authenticated";
import { RealWeatherController } from "../../src/pusher/controllers/RealWeatherController";
import type { RealWeatherForecast } from "../../src/common/RealWeather";

vi.mock("../../src/pusher/middlewares/Authenticated", () => ({
    authenticated: (req: Request, res: ResponseWithUserIdentifier, next: NextFunction): void => {
        if (!req.headers.authorization) {
            res.status(401).send();
            return;
        }
        res.userIdentifier = req.headers.authorization;
        next();
    },
}));

let server: Server;
let base: string;
const weather = vi.fn<(place?: Pick<WeatherLocation, "latitude" | "longitude">) => Promise<RealWeatherForecast>>();
const search = vi.fn<(query: string) => Promise<WeatherLocation[] | undefined>>();

beforeEach(async () => {
    weather.mockResolvedValue({ slots: [{ at: 0, weather: WeatherType.Clear, temperature: 7 }] });
    search.mockResolvedValue([]);
    const app = express();
    new RealWeatherController(app, { get: weather }, { search });
    server = await new Promise<Server>((resolve) => {
        const running = app.listen(0, "127.0.0.1", () => resolve(running));
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing server address");
    base = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
        server.close((error) => {
            if (error) reject(error);
            else resolve();
        });
    });
    vi.clearAllMocks();
});

const as = (user: string) => ({ headers: { Authorization: user } });

describe("RealWeatherController", () => {
    it("serves the timeline of the place asked, of Paris without both coordinates, to players only", async () => {
        expect((await fetch(`${base}/real-weather`)).status).toBe(401);
        expect(weather).not.toHaveBeenCalled();

        const response = await fetch(`${base}/real-weather?latitude=45.75&longitude=4.85`, as("ada"));
        expect(response.status).toBe(200);
        expect(response.headers.get("Cache-Control")).toBe("private, no-store");
        expect(await response.json()).toEqual({ slots: [{ at: 0, weather: "clear", temperature: 7 }] });
        expect(weather).toHaveBeenLastCalledWith({ latitude: 45.75, longitude: 4.85 });

        await fetch(`${base}/real-weather?latitude=45.75`, as("ada"));
        expect(weather).toHaveBeenLastCalledWith(undefined);
    });

    it("refuses coordinates out of the globe or not numbers", async () => {
        for (const query of ["latitude=91&longitude=0", "latitude=0&longitude=-181", "latitude=abc&longitude=1"]) {
            // eslint-disable-next-line no-await-in-loop -- requests counted one after the other
            expect((await fetch(`${base}/real-weather?${query}`, as("ada"))).status).toBe(400);
        }
        expect(weather).not.toHaveBeenCalled();
    });

    it("answers 502 when the town search is unavailable, unlike a town not found", async () => {
        search.mockResolvedValueOnce(undefined);
        const failing = await fetch(`${base}/real-weather/places?q=Brest`, as("ada"));
        expect(failing.status).toBe(502);
        expect(await failing.json()).toEqual({ error: "unavailable" });
        const empty = await fetch(`${base}/real-weather/places?q=zzqqxx`, as("ada"));
        expect(empty.status).toBe(200);
        expect(await empty.json()).toEqual([]);
    });

    it("lets each player make thirty requests a minute, the others keeping theirs", async () => {
        for (let index = 0; index < 30; index++) {
            // eslint-disable-next-line no-await-in-loop -- requests counted one after the other
            expect((await fetch(`${base}/real-weather`, as("ada"))).status).toBe(200);
        }
        const limited = await fetch(`${base}/real-weather/places?q=Lyon`, as("ada"));
        expect(limited.status).toBe(429);
        expect(limited.headers.get("Retry-After")).toBe("60");
        expect((await fetch(`${base}/real-weather`, as("grace"))).status).toBe(200);
    });
});
