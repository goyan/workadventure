import type { Animal } from "./Animal";

/** An antelope leads so many of its kind: a land with more of them has several herds. */
export const HERD_SIZE = 8;
/** How far from its leader an animal of a group strolls, in map pixels. */
export const GROUP_REACH_PX = 64;
/** A lion this close to the catch of another of its pride eats of it, in map pixels. */
export const PRIDE_SHARE_PX = 80;

/**
 * How the animals of a species live together. A herd follows its oldest females, one for `HERD_SIZE` animals (a
 * matriarchy); a pride follows its oldest male, the only one that breeds (a patriarchy).
 *
 * Nothing of a group is kept: who leads is read again at each step from who lives where, so a leader that dies, is
 * tamed or leaves its land is replaced at once.
 */
export type GroupKind = "herd" | "pride";

const oldestFirst = (a: Animal, b: Animal): number => a.bornAt - b.bornAt || a.id - b.id;

/** The leaders among the animals of one species that live in one place. */
export function leadersOf(kind: GroupKind, members: readonly Animal[]): Animal[] {
    const sex = kind === "herd" ? "female" : "male";
    const elders = members.filter((member) => member.sex === sex).sort(oldestFirst);
    return elders.slice(0, kind === "herd" ? Math.ceil(members.length / HERD_SIZE) : 1);
}

/** The leader an animal follows: the nearest one, none for a leader itself. */
export function leaderOf(animal: Animal, leaders: readonly Animal[]): Animal | undefined {
    if (leaders.includes(animal)) return undefined;
    let best: Animal | undefined;
    let least = Infinity;
    for (const leader of leaders) {
        const far = Math.hypot(leader.x - animal.x, leader.y - animal.y);
        if (far < least) {
            least = far;
            best = leader;
        }
    }
    return best;
}
