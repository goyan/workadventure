/**
 * A quantity of the water dashboard, short enough to compare at a glance: whole above 100 (thousands apart), one
 * decimal above 1, three under (a real rain on a small hollow is a few litres an hour).
 */
export function waterFigure(value: number): string {
    if (!Number.isFinite(value)) return "0";
    const size = Math.abs(value);
    const rounded =
        size >= 100 ? Math.round(size) : size >= 1 ? Math.round(size * 10) / 10 : Math.round(size * 1000) / 1000;
    const [whole, decimals] = String(rounded).split(".");
    const spaced = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return decimals ? `${spaced}.${decimals}` : spaced;
}

/** What comes in less what goes out, with its sign: "+30", "−18", "0". */
export function signedWaterFigure(value: number): string {
    const figure = waterFigure(value);
    if (figure === "0") return "0";
    return value > 0 ? `+${figure}` : `−${figure}`;
}
