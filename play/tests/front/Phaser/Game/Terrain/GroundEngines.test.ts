import { describe, expect, it, vi } from "vitest";
import { GroundEngines } from "../../../../../src/front/Phaser/Game/Terrain/GroundEngines";

function fixture() {
    const made: {
        setHidden: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
        destroy: ReturnType<typeof vi.fn>;
    }[] = [];
    const create = vi.fn(() => {
        const ground = { setHidden: vi.fn(), update: vi.fn(), destroy: vi.fn() };
        made.push(ground);
        return ground;
    });
    return { engines: new GroundEngines(create), create, made };
}

describe("the relief in 3/4, made only for who chose it", () => {
    it("makes nothing while it is not chosen: no block, no worker", () => {
        const { engines, create } = fixture();
        for (let now = 0; now < 5; now++) engines.sync({ chosen: false, shown: false }, now);
        expect(create).not.toHaveBeenCalled();
        expect(engines.current()).toBeUndefined();
    });

    it("is made once when chosen, shown, and updated at each image", () => {
        const { engines, create, made } = fixture();
        engines.sync({ chosen: true, shown: true }, 10);
        engines.sync({ chosen: true, shown: true }, 20);
        expect(create).toHaveBeenCalledTimes(1);
        expect(engines.current()).toBe(made[0]);
        expect(made[0].setHidden.mock.calls).toEqual([[false], [false]]);
        expect(made[0].update.mock.calls).toEqual([[10], [20]]);
    });

    it("is hidden, not destroyed, while the map is edited or in Basique, and the same one is shown again after", () => {
        const { engines, create, made } = fixture();
        engines.sync({ chosen: true, shown: true }, 0);
        engines.sync({ chosen: true, shown: false }, 1);
        expect(made[0].setHidden).toHaveBeenLastCalledWith(true);
        expect(made[0].destroy).not.toHaveBeenCalled();
        engines.sync({ chosen: true, shown: true }, 2);
        expect(made[0].setHidden).toHaveBeenLastCalledWith(false);
        expect(create).toHaveBeenCalledTimes(1);
    });

    it("is made hidden when chosen while the map is edited", () => {
        const { engines, made } = fixture();
        engines.sync({ chosen: true, shown: false }, 0);
        expect(made[0].setHidden.mock.calls).toEqual([[true]]);
    });

    it("is destroyed as soon as it is no longer chosen, and made anew when chosen again", () => {
        const { engines, create, made } = fixture();
        engines.sync({ chosen: true, shown: true }, 0);
        engines.sync({ chosen: false, shown: false }, 1);
        engines.sync({ chosen: false, shown: false }, 2);
        expect(made[0].destroy).toHaveBeenCalledTimes(1);
        expect(made[0].update).toHaveBeenCalledTimes(1);
        expect(engines.current()).toBeUndefined();
        engines.sync({ chosen: true, shown: true }, 3);
        expect(create).toHaveBeenCalledTimes(2);
        expect(engines.current()).toBe(made[1]);
    });

    it("destroys what it made with the scene, once", () => {
        const { engines, made } = fixture();
        engines.sync({ chosen: true, shown: true }, 0);
        engines.destroy();
        engines.destroy();
        expect(made[0].destroy).toHaveBeenCalledTimes(1);
        expect(engines.current()).toBeUndefined();
    });
});
