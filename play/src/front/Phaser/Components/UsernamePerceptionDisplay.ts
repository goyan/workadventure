import type { PerceptionMark } from "../Game/Perception/PerceptionProtocol";
import {
    PERCEPTION_MARK_AURA,
    PERCEPTION_MARK_FLOAT_PERIOD_MS,
    PERCEPTION_MARK_FLOAT_PX,
    PERCEPTION_MARK_TWINKLE_PERIOD_MS,
    perceptionMarkPixels,
    perceptionMarkSize,
} from "../Game/Perception/PerceptionMarkShape";

const SVG_NS = "http://www.w3.org/2000/svg";

/** The system asks for less motion: the symbol stands still. */
const REDUCED_MOTION = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/** The symbol rests on one position or the other, never in between. */
export const FLOAT_EASING = "steps(2, jump-none)";

/** A size in pixels of the game, laid out at the scale of the name tag. */
function gamePx(px: number): string {
    return `calc(${px}px * var(--username-dom-scale, 1))`;
}

/**
 * The symbol of a perception changed by a spell (see PerceptionMarkShape), floating over the name tag of another
 * player: a DOM element inside the tag, so that it shares its layer (over the night veil and the fog), its scale and
 * its place (the floor, the plane). Its motion is played by the browser on its own: the scene is never drawn again for
 * it. Hidden with the tag (the video bubble over the avatar).
 */
export class UsernamePerceptionDisplay {
    public readonly element: HTMLSpanElement;
    private readonly floater: HTMLSpanElement;
    private mark: PerceptionMark | undefined;
    private animations: Animation[] = [];

    constructor(private readonly reducedMotion = REDUCED_MOTION) {
        this.element = document.createElement("span");
        this.element.className = "username-perception";
        this.element.style.position = "absolute";
        this.element.style.left = "50%";
        this.element.style.transform = "translateX(-50%)";
        this.element.style.display = "none";
        this.element.style.lineHeight = "0";
        // The tooltip of the symbol (its title) needs the pointer.
        this.element.style.pointerEvents = "auto";
        this.floater = document.createElement("span");
        this.floater.style.display = "block";
        this.element.append(this.floater);
    }

    /** Shows `mark` (none: hidden), `lift` pixels of the game over the top of the name tag. */
    public show(mark: PerceptionMark | undefined, title: string, lift: number): void {
        this.element.style.bottom = `calc(100% + ${gamePx(lift)})`;
        this.element.title = mark === undefined ? "" : title;
        if (mark === this.mark) return;
        this.mark = mark;
        this.stopAnimations();
        this.floater.replaceChildren();
        this.element.style.display = mark === undefined ? "none" : "";
        if (mark === undefined) return;
        const { svg, sparkles } = drawMark(mark);
        this.floater.append(svg);
        if (this.reducedMotion || typeof this.floater.animate !== "function") return;
        this.animations.push(
            this.floater.animate(
                [
                    { transform: "translateY(0)" },
                    { transform: `translateY(calc(-${PERCEPTION_MARK_FLOAT_PX}px * var(--username-dom-scale, 1)))` },
                ],
                // Up, then down again: two positions per period, by whole pixels.
                {
                    duration: PERCEPTION_MARK_FLOAT_PERIOD_MS / 2,
                    iterations: Infinity,
                    direction: "alternate",
                    easing: FLOAT_EASING,
                },
            ),
        );
        if (typeof sparkles.animate === "function") {
            this.animations.push(
                sparkles.animate([{ opacity: 1 }, { opacity: 0.3 }, { opacity: 1 }], {
                    duration: PERCEPTION_MARK_TWINKLE_PERIOD_MS,
                    iterations: Infinity,
                    easing: "steps(3, jump-none)",
                }),
            );
        }
    }

    /** Whether the symbol moves (never under reduced motion). */
    public get animated(): boolean {
        return this.animations.length > 0;
    }

    public destroy(): void {
        this.stopAnimations();
        this.element.remove();
    }

    private stopAnimations(): void {
        for (const animation of this.animations) animation.cancel();
        this.animations = [];
    }
}

/** The drawing of a symbol, one square per pixel; its sparkles in a group of their own, which twinkles. */
function drawMark(mark: PerceptionMark): { svg: SVGSVGElement; sparkles: SVGGElement } {
    const { width, height } = perceptionMarkSize(mark);
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("shape-rendering", "crispEdges");
    svg.setAttribute("aria-hidden", "true");
    svg.dataset.mark = mark;
    svg.style.width = gamePx(width);
    svg.style.height = gamePx(height);
    svg.style.overflow = "visible";
    svg.style.filter = `drop-shadow(0 0 ${gamePx(1)} ${PERCEPTION_MARK_AURA[mark]})`;
    const body = document.createElementNS(SVG_NS, "g");
    const sparkles = document.createElementNS(SVG_NS, "g");
    for (const pixel of perceptionMarkPixels(mark)) {
        const rect = document.createElementNS(SVG_NS, "rect");
        rect.setAttribute("x", String(pixel.x));
        rect.setAttribute("y", String(pixel.y));
        rect.setAttribute("width", "1");
        rect.setAttribute("height", "1");
        rect.setAttribute("fill", pixel.color);
        (pixel.sparkle ? sparkles : body).append(rect);
    }
    svg.append(body, sparkles);
    return { svg, sparkles };
}
