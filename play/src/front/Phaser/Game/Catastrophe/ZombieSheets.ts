/**
 * The zombies of a horde, as the user of the fork drew them for this project (play/public/resources/zombies): a man in
 * a jacket, a woman bare to the waist, a woman in a skirt, each a sheet of five rows (idle, walk, attack, hurt, dead),
 * seen from the side, facing right, their feet centred on the bottom of their cell. The woman bare to the waist runs.
 */
export interface ZombieSheet {
    key: string;
    url: string;
    frameWidth: number;
    frameHeight: number;
    /** How many images each row has: idle, walk, attack, hurt, dead. */
    counts: readonly [number, number, number, number, number];
}

export const ZOMBIE_IDLE = 0;
export const ZOMBIE_WALK = 1;
export const ZOMBIE_ATTACK = 2;
export const ZOMBIE_HURT = 3;
export const ZOMBIE_DEAD = 4;

export const ZOMBIE_SHEETS: readonly ZombieSheet[] = [
    {
        key: "zombie-homme-veste",
        url: "/resources/zombies/zombie-homme-veste.png",
        frameWidth: 86,
        frameHeight: 70,
        counts: [6, 8, 5, 4, 5],
    },
    {
        key: "zombie-femme-torse",
        url: "/resources/zombies/zombie-femme-torse.png",
        frameWidth: 110,
        frameHeight: 76,
        counts: [6, 8, 5, 4, 5],
    },
    {
        key: "zombie-femme-jupe",
        url: "/resources/zombies/zombie-femme-jupe.png",
        frameWidth: 98,
        frameHeight: 80,
        counts: [7, 8, 8, 4, 5],
    },
];

/** The most images a row has: the sheets are laid in the atlas with this many columns. */
export const ZOMBIE_SHEET_COLUMNS = 8;

/** Where each sheet lies in the atlas of the horde: one above the other, at their top left corner. */
export function zombieAtlasLayout(): { width: number; height: number; tops: number[] } {
    const tops: number[] = [];
    let height = 0;
    let width = 0;
    for (const sheet of ZOMBIE_SHEETS) {
        tops.push(height);
        height += sheet.frameHeight * sheet.counts.length;
        width = Math.max(width, sheet.frameWidth * ZOMBIE_SHEET_COLUMNS);
    }
    return { width, height, tops };
}

/** The number of the frame of a sheet, a row and an image in the atlas. */
export function zombieAtlasFrame(sheet: number, row: number, image: number): number {
    return (sheet * ZOMBIE_SHEETS[0].counts.length + row) * ZOMBIE_SHEET_COLUMNS + image;
}
