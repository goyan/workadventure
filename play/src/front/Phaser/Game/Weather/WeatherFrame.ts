import { WeatherType } from "@workadventure/map-editor";
import { snowPossibleAt } from "../Nature/SeasonClock";

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

/** One gentle glow every 23 seconds, at the same server time for everyone. */
export function stormGlow(epoch: number): number {
    const phase = ((epoch % 23000) + 23000) % 23000;
    return phase < 1200 ? Math.sin((phase / 1200) * Math.PI) * 0.12 : 0;
}

/** A common thirty-minute phase survives reconnects and server restarts. */
export function weatherAtTime(configured: WeatherType, serverDate: Date | undefined): WeatherType {
    if (configured === WeatherType.Snow) {
        if (!serverDate || !Number.isFinite(serverDate.getTime())) return WeatherType.Clear;
        return snowPossibleAt(serverDate) ? WeatherType.Snow : WeatherType.Rain;
    }
    if (configured !== WeatherType.Automatic) return configured;
    if (!serverDate || !Number.isFinite(serverDate.getTime())) return WeatherType.Clear;
    const cycle = [WeatherType.Clear, WeatherType.Rain, WeatherType.Storm, WeatherType.Snow];
    const phase = Math.floor(serverDate.getTime() / (30 * 60 * 1000));
    const weather = cycle[((phase % cycle.length) + cycle.length) % cycle.length] ?? WeatherType.Clear;
    return weather === WeatherType.Snow && !snowPossibleAt(serverDate) ? WeatherType.Rain : weather;
}

/** Weather only falls outdoors: particles above an indoor cell are not drawn. No grid means no filtering. */
export function keepOutdoorParticles(
    particles: WeatherParticle[],
    isOutdoor: ((x: number, y: number) => boolean) | undefined,
): WeatherParticle[] {
    return isOutdoor ? particles.filter((particle) => isOutdoor(particle.x, particle.y)) : particles;
}

/** The personal Christmas theme shows snow, whatever the map weather. */
export function effectiveWeather(weather: WeatherType, christmas: boolean): WeatherType {
    return christmas ? WeatherType.Snow : weather;
}
