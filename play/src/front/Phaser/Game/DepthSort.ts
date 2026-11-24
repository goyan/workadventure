/**
 * Puts an object at a depth, only when it is not there already. Phaser sorts the whole scene again at the next
 * image as soon as a depth is set, even to the value it had: on a map of thousands of objects, a view that sets the
 * depth of its sprites at every image made every image pay for a full sort.
 */
export function placeAtDepth(object: { depth: number; setDepth(depth: number): unknown }, depth: number): void {
    if (object.depth !== depth) object.setDepth(depth);
}
