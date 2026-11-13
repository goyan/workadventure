import { WeatherType } from "@workadventure/map-editor";
import type { AutoWeatherSettings } from "@workadventure/map-editor";
import { snowPossibleAt } from "../Nature/SeasonClock";
import { SeasonalTheme } from "../Seasonal/SeasonalTheme";
import { hash01, leafColor } from "../Autumn/LeafPalette";
import { autoWeatherAt, slotStart } from "./WeatherSchedule";

export interface WeatherView {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface WeatherParticle {
    x: number;
    y: number;
    length: number;
}

/** A field fixed to world coordinates, so camera movement never drags the rain along. */
export function weatherParticles(weather: WeatherType, epoch: number, view: WeatherView): WeatherParticle[] {
    if (weather === WeatherType.Clear) return [];
    const cellSize = Math.max(64, Math.ceil(Math.sqrt((view.width * view.height) / 350)));
    const snow = weather === WeatherType.Snow;
    const speed = snow ? 18 : weather === WeatherType.Storm ? 210 : 150;
    const time = epoch / 1000;
    const particles: WeatherParticle[] = [];
    for (let row = Math.floor(view.y / cellSize) - 1; row <= Math.ceil((view.y + view.height) / cellSize); row++) {
        for (let col = Math.floor(view.x / cellSize) - 1; col <= Math.ceil((view.x + view.width) / cellSize); col++) {
            const seed = Math.abs(Math.sin(col * 127.1 + row * 311.7) * 43758.5453) % 1;
            particles[particles.length] = {
                x: col * cellSize + seed * cellSize + (snow ? Math.sin(time + seed * 20) * 5 : 0),
                y: row * cellSize + ((seed * cellSize + time * speed) % cellSize),
                length: snow ? 2 : weather === WeatherType.Storm ? 13 : 9,
            };
        }
    }
    return particles;
}

export interface LeafParticle {
    x: number;
    y: number;
    color: number;
    /** 3×4 instead of 4×3: the leaf turns as it sways. */
    vertical: boolean;
}

/** Leaves fall slower than snow, sway, and drift with a light wind; about three times fewer than snowflakes. */
export function leafParticles(epoch: number, view: WeatherView): LeafParticle[] {
    const snowCell = Math.max(64, Math.ceil(Math.sqrt((view.width * view.height) / 350)));
    const cellSize = Math.round(snowCell * Math.sqrt(3));
    const time = epoch / 1000;
    const particles: LeafParticle[] = [];
    for (let row = Math.floor(view.y / cellSize) - 1; row <= Math.ceil((view.y + view.height) / cellSize); row++) {
        for (let col = Math.floor(view.x / cellSize) - 1; col <= Math.ceil((view.x + view.width) / cellSize); col++) {
            const seed = hash01(col, row);
            const sway = (time * 2 * Math.PI) / 3 + seed * 20;
            particles[particles.length] = {
                x: col * cellSize + ((seed * cellSize + time * 6) % cellSize) + Math.sin(sway) * 8,
                y: row * cellSize + ((hash01(col, row, 1) * cellSize + time * 12) % cellSize),
                color: leafColor(hash01(col, row, 2)),
                vertical: Math.cos(sway) > 0,
            };
        }
    }
    return particles;
}

/** One gentle glow every 23 seconds, at the same server time for everyone. */
export function stormGlow(epoch: number): number {
    const phase = ((epoch % 23000) + 23000) % 23000;
    return phase < 1200 ? Math.sin((phase / 1200) * Math.PI) * 0.12 : 0;
}

/** The seasonal schedule is shared by every client: same Paris date and settings, same weather. */
export function weatherAtTime(
    configured: WeatherType,
    serverDate: Date | undefined,
    auto?: AutoWeatherSettings,
): WeatherType {
    if (configured === WeatherType.Snow) {
        if (!serverDate || !Number.isFinite(serverDate.getTime())) return WeatherType.Clear;
        return snowPossibleAt(serverDate) ? WeatherType.Snow : WeatherType.Rain;
    }
    if (configured !== WeatherType.Automatic) return configured;
    if (!serverDate || !Number.isFinite(serverDate.getTime())) return WeatherType.Clear;
    return autoWeatherAt(serverDate, auto);
}

/** Weather only falls outdoors: particles above an indoor cell are not drawn. No grid means no filtering. */
export function keepOutdoorParticles<T extends { x: number; y: number }>(
    particles: T[],
    isOutdoor: ((x: number, y: number) => boolean) | undefined,
): T[] {
    return isOutdoor ? particles.filter((particle) => isOutdoor(particle.x, particle.y)) : particles;
}

/** The personal Christmas theme shows snow, whatever the map weather; autumn keeps the map weather. */
export function effectiveWeather(weather: WeatherType, theme: SeasonalTheme | undefined): WeatherType {
    return theme === SeasonalTheme.Christmas ? WeatherType.Snow : weather;
}

const SLOT_MS = 30 * 60 * 1000;
const FOG_FADE_MS = 3 * 60 * 1000;

/**
 * How thick the fog is, from 0 to 1. A fixed fog is always full; in a slot of automatic fog, it rises over three
 * minutes when the previous slot has none and fades over the last three when the next one has none.
 */
export function fogStrength(configured: WeatherType, date: Date, auto?: AutoWeatherSettings): number {
    if (configured === WeatherType.Fog) return 1;
    if (configured !== WeatherType.Automatic) return 0;
    const time = date.getTime();
    if (!Number.isFinite(time) || autoWeatherAt(date, auto) !== WeatherType.Fog) return 0;
    const start = slotStart(date).getTime();
    let strength = 1;
    if (autoWeatherAt(new Date(start - 1), auto) !== WeatherType.Fog) {
        strength = Math.min(strength, (time - start) / FOG_FADE_MS);
    }
    if (autoWeatherAt(new Date(start + SLOT_MS), auto) !== WeatherType.Fog) {
        strength = Math.min(strength, (start + SLOT_MS - time) / FOG_FADE_MS);
    }
    return Math.max(0, Math.min(1, strength));
}

export interface FogPatch {
    x: number;
    y: number;
    radius: number;
}

const FOG_PATCHES = 4;
const FOG_DRIFT = { x: 3.2, y: 2.4 };

/**
 * A few soft patches fixed to the world that drift slowly (4 px a second). Each one wraps around a window a little
 * larger than the view, so there are always as many on screen whatever the camera does.
 */
export function fogPatches(epoch: number, view: WeatherView, still: boolean): FogPatch[] {
    const radius = Math.max(120, Math.round(Math.max(view.width, view.height) * 0.3));
    const windowWidth = view.width + 2 * radius;
    const windowHeight = view.height + 2 * radius;
    const time = still ? 0 : epoch / 1000;
    const wrap = (value: number, period: number): number => ((value % period) + period) % period;
    const patches: FogPatch[] = [];
    for (let index = 0; index < FOG_PATCHES; index++) {
        const x = hash01(index, 7) * windowWidth * 4 + time * FOG_DRIFT.x;
        const y = hash01(index, 13) * windowHeight * 4 + time * FOG_DRIFT.y;
        patches[index] = {
            x: view.x - radius + wrap(x - (view.x - radius), windowWidth),
            y: view.y - radius + wrap(y - (view.y - radius), windowHeight),
            radius: Math.round(radius * (0.8 + 0.2 * hash01(index, 21))),
        };
    }
    return patches;
}
