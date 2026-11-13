import { WeatherType } from "@workadventure/map-editor";
import type { AutoWeatherSettings } from "@workadventure/map-editor";
import { snowPossibleAt } from "../Nature/SeasonClock";
import { SeasonalTheme } from "../Seasonal/SeasonalTheme";
import { hash01, leafColor } from "../Autumn/LeafPalette";
import { autoWeatherAt } from "./WeatherSchedule";

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
