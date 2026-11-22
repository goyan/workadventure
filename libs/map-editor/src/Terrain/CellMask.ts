/**
 * Whether a cell is one of `cells`, answered from a mask of bytes over the rectangle that holds them: for a set that
 * is asked cell after cell over a whole map (the cells of the pools, the tiles under the bridges), where building a
 * key of text for each question costs more than the question. No cell: always false.
 */
export function cellMaskOf(cells: Iterable<{ x: number; y: number }>): (x: number, y: number) => boolean {
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    const kept: { x: number; y: number }[] = [];
    for (const { x, y } of cells) {
        if (!Number.isInteger(x) || !Number.isInteger(y)) continue;
        kept.push({ x, y });
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
    }
    if (kept.length === 0) return () => false;
    const width = right - left + 1;
    const height = bottom - top + 1;
    const mask = new Uint8Array(width * height);
    for (const { x, y } of kept) mask[(y - top) * width + (x - left)] = 1;
    return (x, y) => {
        const column = x - left;
        const row = y - top;
        // What is not a whole number is no cell of the set, as a key of text would not match either.
        if (!Number.isInteger(column) || !Number.isInteger(row)) return false;
        if (column < 0 || row < 0 || column >= width || row >= height) return false;
        return mask[row * width + column] === 1;
    };
}
