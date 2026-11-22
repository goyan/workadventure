import * as Phaser from "phaser";

/** A character drawn lower in a hollow: its place, and how much lower it is drawn (Character.getGroundDrop). */
export interface DroppedCharacter {
    y: number;
    getGroundDrop(): number;
}

/**
 * Draws the characters lower by the depth of the hollow they stand in (avatarDrop), only while the image is drawn:
 * moved down just before the drawing, put back just after. Their place, their body, the walk and what the server
 * knows never see it (as the trees leaning in the wind, TreeSway).
 */
export class CharacterDrops {
    private readonly moved: { character: DroppedCharacter; by: number }[] = [];

    constructor(
        private readonly scene: Phaser.Scene,
        private readonly characters: () => Iterable<DroppedCharacter>,
    ) {
        scene.events.on(Phaser.Scenes.Events.PRE_RENDER, this.lower);
        scene.events.on(Phaser.Scenes.Events.RENDER, this.putBack);
    }

    public destroy(): void {
        this.putBack();
        this.scene.events.off(Phaser.Scenes.Events.PRE_RENDER, this.lower);
        this.scene.events.off(Phaser.Scenes.Events.RENDER, this.putBack);
    }

    private readonly lower = (): void => {
        this.putBack();
        for (const character of this.characters()) {
            const by = character.getGroundDrop();
            if (by === 0) continue;
            character.y += by;
            this.moved.push({ character, by });
        }
    };

    private readonly putBack = (): void => {
        for (const { character, by } of this.moved) character.y -= by;
        this.moved.length = 0;
    };
}
