export interface AvatarVideoPlacement {
    x: number;
    y: number;
    size: number;
}

export interface AvatarVideoAnchor {
    id: string;
    x: number;
    y: number;
}

export interface GroupedAvatarVideoPlacement extends AvatarVideoPlacement {
    group: string;
}

/** Phaser reads this snapshot each render; updating it must not schedule a Svelte rerender per frame. */
export function createAvatarVideoLayout(): {
    update: (avatars: readonly AvatarVideoAnchor[]) => void;
    get: (id: string) => GroupedAvatarVideoPlacement | undefined;
} {
    let placements = new Map<string, GroupedAvatarVideoPlacement>();
    return {
        update: (avatars): void => {
            placements = groupedAvatarVideoLayout(avatars, placements);
        },
        get: (id): GroupedAvatarVideoPlacement | undefined => placements.get(id),
    };
}

/** Only overlapping neighbours form a group; a wider exit threshold avoids flickering at its edge. */
export function groupedAvatarVideoLayout(
    avatars: readonly AvatarVideoAnchor[],
    previous: ReadonlyMap<string, GroupedAvatarVideoPlacement> = new Map(),
): Map<string, GroupedAvatarVideoPlacement> {
    const roots = new Map(avatars.map(({ id }) => [id, id]));
    const rootOf = (id: string): string => {
        let root = id;
        let parent = roots.get(root);
        while (parent !== undefined && parent !== root) {
            root = parent;
            parent = roots.get(root);
        }
        return root;
    };
    for (const [index, avatar] of avatars.entries()) {
        for (const other of avatars.slice(index + 1)) {
            const group = previous.get(avatar.id)?.group;
            const stayedTogether = group !== undefined && group === previous.get(other.id)?.group;
            const margin = stayedTogether ? 12 : 0;
            if (Math.abs(avatar.x - other.x) < 54 + margin && Math.abs(avatar.y - other.y) < 68 + margin) {
                roots.set(rootOf(other.id), rootOf(avatar.id));
            }
        }
    }
    const groups = new Map<string, AvatarVideoAnchor[]>();
    for (const avatar of avatars) {
        const root = rootOf(avatar.id);
        groups.set(root, [...(groups.get(root) ?? []), avatar]);
    }
    const placements = new Map<string, GroupedAvatarVideoPlacement>();
    for (const group of groups.values()) {
        if (group.length < 2) continue;
        // Identity order stays stable when people cross or the speaker changes.
        const ordered = group.reduce<AvatarVideoAnchor[]>((sorted, avatar) => {
            const index = sorted.findIndex((other) => avatar.id.localeCompare(other.id) < 0);
            return index < 0 ? [...sorted, avatar] : [...sorted.slice(0, index), avatar, ...sorted.slice(index)];
        }, []);
        const groupId = ordered[0]?.id;
        if (groupId === undefined) continue;
        compactAvatarVideoLayout(ordered).forEach((position, index) => {
            const avatar = ordered[index];
            if (avatar) placements.set(avatar.id, { ...position, group: groupId });
        });
    }
    return placements;
}

/** Place cameras in input order, with at most four per row. */
export function compactAvatarVideoLayout(avatars: readonly { x: number; y: number }[]): AvatarVideoPlacement[] {
    if (avatars.length === 0) return [];
    const size = 38;
    const spacing = size + 6;
    const rowSpacing = size + 20;
    const columns = Math.min(4, avatars.length);
    const rows = Math.ceil(avatars.length / columns);
    const centerX = avatars.reduce((sum, avatar) => sum + avatar.x, 0) / avatars.length;
    const bottomY = Math.min(...avatars.map((avatar) => avatar.y)) - 34;
    return avatars.map((_, index) => {
        const row = Math.floor(index / columns);
        const rowCount = Math.min(columns, avatars.length - row * columns);
        return {
            x: centerX + ((index % columns) - (rowCount - 1) / 2) * spacing,
            y: bottomY - (rows - 1 - row) * rowSpacing,
            size,
        };
    });
}
