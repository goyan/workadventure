/** Three distinct presses of one direction, at most 300 ms apart; key repeats never count. */
export class TripleTapVehicle {
    private previousDown = new Set<number>();
    private direction: number | undefined;
    private lastPress = 0;
    private count = 0;

    public update(directions: number[], now: number): boolean {
        let triggered = false;
        for (const direction of directions) {
            if (this.previousDown.has(direction)) continue;
            this.count = direction === this.direction && now - this.lastPress <= 300 ? this.count + 1 : 1;
            this.direction = direction;
            this.lastPress = now;
            if (this.count === 3) {
                triggered = true;
                this.count = 0;
            }
        }
        this.previousDown = new Set(directions);
        return triggered;
    }

    public reset(): void {
        this.previousDown.clear();
        this.direction = undefined;
        this.count = 0;
    }
}
