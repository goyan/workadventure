import * as Phaser from "phaser";
import type { Readable } from "svelte/store";
import type { Game } from "../Game/Game";

/**
 * The game is drawn in game pixels, fewer than the screen has (HdpiManager), and the browser stretched the canvas
 * with `image-rendering: pixelated`. At a scale that is not a whole number (2.53 on a 1080p screen at the default
 * zoom), some game pixels then cover 2 screen pixels and others 3: uneven pixels that shimmer when the camera moves.
 *
 * This pass shows the canvas through a second canvas at the screen's own definition, with a "sharp bilinear" filter:
 * every game pixel the same size, flat in its middle, and only the screen pixel on its border blended with its
 * neighbour. One texture read per screen pixel, once per image the game draws: the game itself is still drawn in
 * game pixels (drawing it at the screen's definition would run every shader ~6 times more).
 */

const VERTEX = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
    vUv = vec2(aPosition.x * 0.5 + 0.5, 0.5 - aPosition.y * 0.5);
    gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uGame;
uniform vec2 uSize;  // the canvas of the game, in game pixels
uniform vec2 uScale; // screen pixels per game pixel
void main() {
    // Linear filtering blends between the centres of the texels: f goes from one centre (0) to the next (1). It is
    // pushed to 0 or 1 except across the last screen pixel before the border of the game pixel.
    vec2 texel = vUv * uSize;
    vec2 base = floor(texel - 0.5) + 0.5;
    vec2 f = clamp((texel - base - 0.5) * uScale + 0.5, 0.0, 1.0);
    gl_FragColor = texture2D(uGame, (base + f) / uSize);
}
`;

interface Pass {
    gl: WebGLRenderingContext;
    size: WebGLUniformLocation;
    scale: WebGLUniformLocation;
}

export class SharpUpscale {
    private readonly overlay: HTMLCanvasElement;
    private pass: Pass | undefined;
    private enabled = false;
    private readonly resizeObserver: ResizeObserver;
    private readonly unsubscribe: () => void;
    private readonly present = (): void => this.draw();
    private readonly onContextLost = (event: Event): void => {
        event.preventDefault();
        this.pass = undefined;
        this.showOverlay(false);
    };
    private readonly onContextRestored = (): void => this.setEnabled(this.enabled);

    private constructor(
        private readonly game: Game,
        private readonly source: HTMLCanvasElement,
        enabledStore: Readable<boolean>,
    ) {
        this.overlay = document.createElement("canvas");
        this.overlay.dataset.testid = "sharp-upscale";
        this.overlay.setAttribute("aria-hidden", "true");
        this.overlay.className = "pointer-events-none absolute hidden";
        // First of its siblings: above the canvas (not positioned) but under the positioned layers drawn over the
        // game, such as the DOM layer of the names.
        source.parentElement?.prepend(this.overlay);
        this.overlay.addEventListener("webglcontextlost", this.onContextLost);
        this.overlay.addEventListener("webglcontextrestored", this.onContextRestored);
        this.resizeObserver = new ResizeObserver(() => this.place());
        this.resizeObserver.observe(source);
        this.unsubscribe = enabledStore.subscribe((enabled) => this.setEnabled(enabled));
    }

    /** Undefined where the game is not drawn by WebGL (the canvas renderer has no texture to read). */
    public static start(game: Game, enabledStore: Readable<boolean>): SharpUpscale | undefined {
        const source = game.canvas;
        if (!(game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) || !source) {
            return undefined;
        }
        return new SharpUpscale(game, source, enabledStore);
    }

    public destroy(): void {
        this.game.events.off(Phaser.Core.Events.POST_RENDER, this.present);
        this.resizeObserver.disconnect();
        this.unsubscribe();
        this.overlay.removeEventListener("webglcontextlost", this.onContextLost);
        this.overlay.removeEventListener("webglcontextrestored", this.onContextRestored);
        this.overlay.remove();
    }

    private setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        this.game.events.off(Phaser.Core.Events.POST_RENDER, this.present);
        if (enabled) {
            this.pass ??= this.createPass();
        }
        if (!enabled || !this.pass) {
            this.showOverlay(false);
            return;
        }
        this.game.events.on(Phaser.Core.Events.POST_RENDER, this.present);
        this.place();
        // The drawing buffer of the game is only readable while it draws: ask for an image.
        this.game.markDirty();
    }

    private showOverlay(shown: boolean): void {
        this.overlay.classList.toggle("hidden", !shown);
    }

    /** The overlay covers the canvas exactly, at the screen's definition. */
    private place(): void {
        const style = this.overlay.style;
        style.left = `${this.source.offsetLeft}px`;
        style.top = `${this.source.offsetTop}px`;
        style.width = `${this.source.clientWidth}px`;
        style.height = `${this.source.clientHeight}px`;
        const width = Math.round(this.source.clientWidth * window.devicePixelRatio);
        const height = Math.round(this.source.clientHeight * window.devicePixelRatio);
        if (this.overlay.width !== width || this.overlay.height !== height) {
            // Resizing clears the overlay: the canvas shows until the game draws again.
            this.overlay.width = width;
            this.overlay.height = height;
            this.showOverlay(false);
            this.game.markDirty();
        }
    }

    private draw(): void {
        const pass = this.pass;
        const { width, height } = this.overlay;
        if (!this.enabled || !pass || width === 0 || height === 0 || this.source.width === 0) {
            return;
        }
        const gl = pass.gl;
        gl.viewport(0, 0, width, height);
        // Read in the same task as the game drew: the drawing buffer of the game is still there.
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.source);
        gl.uniform2f(pass.size, this.source.width, this.source.height);
        gl.uniform2f(pass.scale, width / this.source.width, height / this.source.height);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        this.showOverlay(true);
    }

    private createPass(): Pass | undefined {
        const gl = this.overlay.getContext("webgl", {
            alpha: false,
            antialias: false,
            depth: false,
            stencil: false,
            powerPreference: "low-power",
        });
        if (!gl) {
            return undefined;
        }
        const program = gl.createProgram();
        const shaders = [
            [gl.VERTEX_SHADER, VERTEX],
            [gl.FRAGMENT_SHADER, FRAGMENT],
        ] as const;
        for (const [type, source] of shaders) {
            const shader = gl.createShader(type);
            if (!shader) {
                return undefined;
            }
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            gl.attachShader(program, shader);
        }
        gl.bindAttribLocation(program, 0, "aPosition");
        gl.linkProgram(program);
        const size = gl.getUniformLocation(program, "uSize");
        const scale = gl.getUniformLocation(program, "uScale");
        if (!gl.getProgramParameter(program, gl.LINK_STATUS) || !size || !scale) {
            return undefined;
        }
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return { gl, size, scale };
    }
}
