import type { GobeurDirection } from "./GobeurProtocol";

export type RgbaImage = { width: number; height: number; data: Uint8ClampedArray };

export type GobeurSheetLayout =
    | { mode: "frames32"; columns: number }
    | { mode: "grid"; columns: 4; cellWidth: number; cellHeight: number };

const FRAME = 32;
const GRID = 4;
const MAX_CHARACTER = 30;
const BOTTOM_ROW = 30;
const ROW_OF_DIRECTION: Record<GobeurDirection, number> = { down: 0, left: 1, right: 2, up: 3 };

export function gobeurSheetLayout(width: number, height: number): GobeurSheetLayout {
    if (width % FRAME === 0 && height === FRAME * GRID) {
        return { mode: "frames32", columns: width / FRAME };
    }
    return { mode: "grid", columns: GRID, cellWidth: Math.floor(width / GRID), cellHeight: Math.floor(height / GRID) };
}

export function gobeurWalkFrames(direction: GobeurDirection, columns: number): number[] {
    const start = ROW_OF_DIRECTION[direction] * columns;
    return Array.from({ length: columns }, (_, i) => start + i);
}

type CellScan = {
    /** 1 where the pixel is character (not background), indexed in cell coordinates. */
    solid: Uint8Array;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    empty: boolean;
};

function isBackgroundColour(data: Uint8ClampedArray, i: number): boolean {
    if (data[i + 3] < 128) return true;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lo = Math.min(r, g, b);
    const hi = Math.max(r, g, b);
    return lo > 190 && hi - lo < 18;
}

function scanCell(image: RgbaImage, ox: number, oy: number, w: number, h: number): CellScan {
    const candidate = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (isBackgroundColour(image.data, ((oy + y) * image.width + ox + x) * 4)) candidate[y * w + x] = 1;
        }
    }
    // Flood fill (4-neighbour) from the border over background candidates.
    const background = new Uint8Array(w * h);
    const stack = new Int32Array(w * h);
    let top = 0;
    const push = (idx: number): void => {
        if (candidate[idx] === 1 && background[idx] === 0) {
            background[idx] = 1;
            stack[top++] = idx;
        }
    };
    for (let x = 0; x < w; x++) {
        push(x);
        push((h - 1) * w + x);
    }
    for (let y = 0; y < h; y++) {
        push(y * w);
        push(y * w + w - 1);
    }
    while (top > 0) {
        const idx = stack[--top];
        const x = idx % w;
        const y = (idx - x) / w;
        if (x > 0) push(idx - 1);
        if (x < w - 1) push(idx + 1);
        if (y > 0) push(idx - w);
        if (y < h - 1) push(idx + w);
    }
    const solid = new Uint8Array(w * h);
    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (background[y * w + x] === 0) {
                solid[y * w + x] = 1;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }
    return { solid, minX, minY, maxX, maxY, empty: maxX < 0 };
}

export function sliceGridSheet(image: RgbaImage): RgbaImage {
    const cw = Math.floor(image.width / GRID);
    const ch = Math.floor(image.height / GRID);
    const out: RgbaImage = {
        width: FRAME * GRID,
        height: FRAME * GRID,
        data: new Uint8ClampedArray(FRAME * GRID * FRAME * GRID * 4),
    };
    if (cw <= 0 || ch <= 0) return out;

    const scans: CellScan[] = [];
    let scale = 0;
    for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
            const scan = scanCell(image, c * cw, r * ch, cw, ch);
            scans.push(scan);
            if (!scan.empty) {
                const bw = scan.maxX - scan.minX + 1;
                const bh = scan.maxY - scan.minY + 1;
                scale = Math.max(scale, bw / MAX_CHARACTER, bh / MAX_CHARACTER);
            }
        }
    }

    for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
            const scan = scans[r * GRID + c];
            if (scan.empty) continue;
            const bw = scan.maxX - scan.minX + 1;
            const bh = scan.maxY - scan.minY + 1;
            const outW = Math.min(MAX_CHARACTER, Math.max(1, Math.round(bw / scale)));
            const outH = Math.min(MAX_CHARACTER, Math.max(1, Math.round(bh / scale)));
            const left = Math.floor((FRAME - outW) / 2);
            const top = BOTTOM_ROW + 1 - outH;
            for (let oy = 0; oy < outH; oy++) {
                const sy = Math.min(bh - 1, Math.floor(((oy + 0.5) * bh) / outH));
                for (let ox = 0; ox < outW; ox++) {
                    const sx = Math.min(bw - 1, Math.floor(((ox + 0.5) * bw) / outW));
                    const cx = scan.minX + sx;
                    const cy = scan.minY + sy;
                    if (scan.solid[cy * cw + cx] === 0) continue;
                    const src = ((r * ch + cy) * image.width + c * cw + cx) * 4;
                    const dst = ((r * FRAME + top + oy) * out.width + c * FRAME + left + ox) * 4;
                    out.data[dst] = image.data[src];
                    out.data[dst + 1] = image.data[src + 1];
                    out.data[dst + 2] = image.data[src + 2];
                    out.data[dst + 3] = 255;
                }
            }
        }
    }
    return out;
}
