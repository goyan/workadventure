import * as Phaser from "phaser";
import {
    HURRICANE_HOLLAND_B,
    HURRICANE_INFLOW_DEGREES,
    HURRICANE_MOTION_SHARE,
    HURRICANE_RMAX_PX,
    HURRICANE_SPIN_SECONDS,
    hurricaneAt,
    hurricaneMaxWind,
} from "@workadventure/map-editor";
import type { Hurricane } from "@workadventure/map-editor";
import { DEPTH_NIGHT_INDEX } from "../DepthIndexes";
import { NOISE_GLSL } from "../ShaderNoise";
import { cloudSunlight, cloudZoomFade } from "../Weather/Clouds";
import { screenScale } from "../Weather/ScreenScale";
import type { SeaHurricane } from "../Terrain/WindSeaShader";

/**
 * How opaque the spiral is over what it covers: whole seen from high above (the spiral reads as on a satellite
 * picture), down to this when one plays close in, so that the avatars stay seen under the storm (cloudZoomFade).
 */
const CLOSE_OPACITY = 0.18;
const FAR_OPACITY = 0.92;
/** The view is drawn with this margin around it (map pixels): the spiral does not end at its edges as one moves. */
const MARGIN_PX = 64;

/**
 * The clouds of a hurricane seen from above, in map pixels, around its eye (uEye: x, y, the radius of the strongest
 * winds, 1 anticlockwise or -1 clockwise): a central dense overcast, two arms of a logarithmic spiral of 15° that turn
 * round the eye, an eye open on the ground, the inner face of the eyewall in shade. The whole turns (uSpin: its angle,
 * in [0, 2 pi)), and moves with the eye. Premultiplied colour, as the clouds of the sky.
 */
const HURRICANE_FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying vec2 outTexCoord;

uniform vec4 uArea;   // the area drawn, map pixels: x, y, width, height
uniform vec4 uEye;    // the eye (map pixels), the radius of the strongest winds (map pixels), the way it turns
uniform vec4 uLook;   // the angle it has turned (radians, in [0, 2 pi)), opacity, night (0 to 1), the fade of its ends

${NOISE_GLSL}

void main() {
    vec2 world = uArea.xy + vec2(outTexCoord.x, 1.0 - outTexCoord.y) * uArea.zw;
    // From the eye, in radii of the strongest winds, north up.
    vec2 d = (world - uEye.xy) / uEye.z;
    d.y = -d.y;
    float r = length(d);
    float spin = uEye.w;
    // In the frame of the clouds, which turn round the eye.
    float a = -uLook.x * spin;
    float ca = cos(a);
    float sa = sin(a);
    vec2 q = vec2(ca * d.x - sa * d.y, sa * d.x + ca * d.y);
    float theta = atan(q.y, q.x);
    // Their texture, carried round with them: billows and finer tufts.
    float n = fbm(q * 2.2 + 41.0);
    float fine = fbm(q * 9.0 + 7.0);
    // Two arms of a logarithmic spiral of 15 degrees (tan 15 = 0.268), trailing outwards, with clear lanes between.
    float arms = 0.5 + 0.5 * cos(2.0 * (spin * theta + log(max(r, 0.05)) / 0.268));
    float band = smoothstep(0.5, 0.78, arms + (n - 0.5) * 0.8 + (fine - 0.5) * 0.25);
    band *= smoothstep(0.9, 1.7, r) * (1.0 - smoothstep(5.0, 11.0, r));
    // The central dense overcast round the eye, frayed at its edge.
    float core = 1.0 - smoothstep(1.3, 2.5, r + (n - 0.5) * 0.7);
    float density = max(core, band * mix(0.75, 1.0, n));
    density *= 0.85 + 0.3 * fine;
    density = smoothstep(0.12, 0.7, density);
    // A thin veil of high cloud over the whole storm, the lanes between the arms included.
    density = max(density, 0.16 * (1.0 - smoothstep(3.0, 12.0, r)) * (0.7 + 0.6 * n));
    // The eye, open on the ground, its rim a little ragged.
    density *= smoothstep(0.5, 0.78, r + (fine - 0.5) * 0.15);
    if (density <= 0.01) discard;
    // White tops, grey where thin; the towers of the eyewall brightest, its inner face in its own shade.
    vec3 lit = vec3(1.0, 1.0, 1.0);
    vec3 shade = vec3(0.6, 0.64, 0.71);
    vec3 color = mix(shade, lit, smoothstep(0.2, 0.9, density) * (0.62 + 0.38 * fine));
    color *= mix(0.68, 1.0, smoothstep(0.55, 1.05, r));
    color += 0.06 * (1.0 - smoothstep(0.0, 0.5, abs(r - 1.1))) * fine;
    // At night, the grey blue of the night clouds.
    color = mix(color, vec3(0.13, 0.16, 0.24), uLook.z * 0.8);
    float alpha = density * uLook.y * uLook.w;
    gl_FragColor = vec4(color * alpha, alpha);
}
`;

/**
 * The spiral of clouds of the hurricane of the room, over the whole map, in place of the clouds of the sky: drawn by
 * the graphics card over the view, around the eye where the server says it is (the same for everyone, from the
 * hurricane and the time of the server). Nothing without WebGL, nor while no hurricane crosses the map.
 */
export class HurricaneView {
    private readonly shader: Phaser.GameObjects.Shader;
    private hurricane: Hurricane | undefined;
    private eye = [0, 0, HURRICANE_RMAX_PX, 1];
    private look = [0, 0, 0, 0];

    private constructor(private readonly scene: Phaser.Scene) {
        this.shader = scene.add
            .shader(
                {
                    name: "Hurricane",
                    fragmentSource: HURRICANE_FRAG,
                    setupUniforms: (setUniform: (name: string, value: unknown) => void) => {
                        setUniform("uArea", [this.shader.x, this.shader.y, this.shader.width, this.shader.height]);
                        setUniform("uEye", this.eye);
                        setUniform("uLook", this.look);
                    },
                },
                0,
                0,
                1,
                1,
            )
            .setOrigin(0)
            // Over the clouds of the sky (which it replaces) and the night veil.
            .setDepth(DEPTH_NIGHT_INDEX + 2)
            .setVisible(false);
    }

    public static create(scene: Phaser.Scene): HurricaneView | undefined {
        return scene.game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer
            ? new HurricaneView(scene)
            : undefined;
    }

    public setHurricane(hurricane: Hurricane | undefined): void {
        this.hurricane = hurricane;
        if (!hurricane) this.shader.setVisible(false);
    }

    /**
     * At each image: where the eye is at `serverDate` and how far the spiral has turned since the storm began (still
     * in reduced motion), over the view of the camera. `sunElevation` darkens it at night. Not `shown` (Basique), it
     * is not drawn: the hurricane still blows.
     */
    public update(
        serverDate: Date | undefined,
        sunElevation: number | undefined,
        reducedMotion: boolean,
        shown: boolean,
    ): void {
        const hurricane = this.hurricane;
        const storm = serverDate ? hurricaneAt(hurricane, serverDate.getTime()) : undefined;
        if (!shown || !hurricane || !storm || storm.share <= 0) {
            if (this.shader.visible) this.shader.setVisible(false);
            return;
        }
        const seconds = reducedMotion ? 0 : (serverDate!.getTime() - hurricane.startedAt) / 1000;
        const turn = ((seconds / HURRICANE_SPIN_SECONDS) % 1) * 2 * Math.PI;
        const opacity = CLOSE_OPACITY + (FAR_OPACITY - CLOSE_OPACITY) * cloudZoomFade(screenScale(this.scene));
        this.eye = [storm.eyeX, storm.eyeY, HURRICANE_RMAX_PX, hurricane.southern ? -1 : 1];
        this.look = [turn, opacity, cloudSunlight(sunElevation).night, storm.share];
        const view = this.scene.cameras.main.worldView;
        this.shader
            .setPosition(view.x - MARGIN_PX, view.y - MARGIN_PX)
            .setSize(view.width + 2 * MARGIN_PX, view.height + 2 * MARGIN_PX)
            .setVisible(true);
    }

    public destroy(): void {
        this.shader.destroy();
    }
}

/**
 * The hurricane over the wind sea at `serverDate` (seaWindHere, the twin of hurricaneHere): where its eye is, how it
 * blows, how much of it has taken over the wind of the map. Undefined outside its passage.
 */
export function seaHurricaneOf(
    hurricane: Hurricane | undefined,
    serverDate: Date | undefined,
): SeaHurricane | undefined {
    const storm = serverDate ? hurricaneAt(hurricane, serverDate.getTime()) : undefined;
    if (!hurricane || !storm || !(storm.share > 0)) return undefined;
    const heading = (hurricane.heading * Math.PI) / 180;
    const motionMs = (HURRICANE_MOTION_SHARE * storm.speedKmh) / 3.6;
    return {
        eyeX: storm.eyeX,
        eyeY: storm.eyeY,
        rmaxPx: HURRICANE_RMAX_PX,
        spin: hurricane.southern ? -1 : 1,
        maxMs: hurricaneMaxWind(hurricane.category) / 3.6,
        hollandB: HURRICANE_HOLLAND_B,
        motionEast: motionMs * Math.sin(heading),
        motionSouth: -motionMs * Math.cos(heading),
        share: storm.share,
        inflow: (HURRICANE_INFLOW_DEGREES * Math.PI) / 180,
    };
}
