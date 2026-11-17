/** Fake scene pieces for the smoke tests of the layers of the sky (no Phaser game needed). */

/** An image that takes every call of the layers. */
class FakeImage {
    public visible = false;
    public alpha = 1;
    setOrigin(): this {
        return this;
    }
    setDepth(): this {
        return this;
    }
    setBlendMode(): this {
        return this;
    }
    setTexture(): this {
        return this;
    }
    setPosition(): this {
        return this;
    }
    setDisplaySize(): this {
        return this;
    }
    setTint(): this {
        return this;
    }
    setAlpha(alpha: number): this {
        this.alpha = alpha;
        return this;
    }
    setVisible(visible: boolean): this {
        this.visible = visible;
        return this;
    }
    destroy(): void {}
}

/** A 2D context that does nothing, and counts what is filled. */
function fakeContext() {
    const calls = { fill: 0, clearRect: 0, clip: 0 };
    const context = {
        fillStyle: "",
        clearRect: () => calls.clearRect++,
        beginPath: () => undefined,
        moveTo: () => undefined,
        lineTo: () => undefined,
        closePath: () => undefined,
        rect: () => undefined,
        fill: () => calls.fill++,
        clip: () => calls.clip++,
        save: () => undefined,
        restore: () => undefined,
    };
    return { context, calls };
}

export function fakeScene(canvas: boolean) {
    const { context, calls } = fakeContext();
    const image = new FakeImage();
    const scene = {
        add: { image: () => image },
        textures: {
            createCanvas: (_key: string, width: number, height: number) =>
                canvas
                    ? {
                          width,
                          height,
                          getContext: () => context,
                          refresh: () => undefined,
                          setFilter: () => undefined,
                          destroy: () => undefined,
                      }
                    : null,
        },
    };
    return { scene: scene as never, image, calls };
}

export const area = { x: -100, y: -50, width: 1200, height: 900 };
export const square = [
    { x: 0, y: 0 },
    { x: 32, y: 0 },
    { x: 32, y: 32 },
    { x: 0, y: 32 },
];
