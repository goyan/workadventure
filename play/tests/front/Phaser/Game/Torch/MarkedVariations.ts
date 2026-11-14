import { TORCH_MARKED_VARIATION } from "../../../../../src/front/Phaser/Game/Torch/TorchFlicker";

/**
 * The marked variations of a curve sampled at each step of the light: its turns (from brighter to dimmer or back)
 * after a change of at least `threshold` since the previous turn, whatever its size. The values held by a step are
 * counted once.
 */
export function markedVariations(values: readonly number[], threshold = TORCH_MARKED_VARIATION): number {
    const changes = values.filter((value, index, all) => index === 0 || value !== all[index - 1]);
    let turns = 0;
    let lastTurn = changes[0];
    let rising = changes[1] > changes[0];
    for (let index = 1; index < changes.length - 1; index++) {
        const nowRising = changes[index + 1] > changes[index];
        if (nowRising !== rising) {
            rising = nowRising;
            if (Math.abs(changes[index] - lastTurn) >= threshold) turns++;
            lastTurn = changes[index];
        }
    }
    return turns;
}

/** The most marked variations in any window of one second (`perSecond` samples). */
export function worstSecond(values: readonly number[], perSecond: number, threshold = TORCH_MARKED_VARIATION): number {
    let worst = 0;
    for (let start = 0; start + perSecond < values.length; start += Math.max(1, Math.floor(perSecond / 3))) {
        worst = Math.max(worst, markedVariations(values.slice(start, start + perSecond + 1), threshold));
    }
    return worst;
}
