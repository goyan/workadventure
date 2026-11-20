/** What refreshCanvasTexture needs of a Phaser canvas texture. */
interface RefreshableTexture {
    source?: readonly { scaleMode: number }[];
    refresh(): unknown;
    setFilter(filterMode: number): unknown;
}

/**
 * Uploads a canvas texture again, keeping the filter it asked for. Phaser 4.2 uploads a canvas with the filter of the
 * game (nearest: the game runs without antialiasing), so a texture set to smooth (`setFilter(LINEAR)`) would show
 * sharp blocks from its first redrawing on. The mode asked for is kept on the source (`scaleMode`): set it again.
 */
export function refreshCanvasTexture(texture: RefreshableTexture): void {
    texture.refresh();
    const asked = texture.source?.[0]?.scaleMode;
    if (asked !== undefined) texture.setFilter(asked);
}
