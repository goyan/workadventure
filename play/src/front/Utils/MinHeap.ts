/** A priority queue: the item with the lowest priority comes out first. */
export class MinHeap<T> {
    private readonly items: { item: T; priority: number }[] = [];

    public push(item: T, priority: number): void {
        this.items.push({ item, priority });
        let child = this.items.length - 1;
        while (child > 0) {
            const parent = (child - 1) >> 1;
            if (this.items[parent].priority <= this.items[child].priority) {
                break;
            }
            [this.items[parent], this.items[child]] = [this.items[child], this.items[parent]];
            child = parent;
        }
    }

    public pop(): T | undefined {
        const top = this.items[0];
        const last = this.items.pop();
        if (top === undefined || last === undefined) {
            return undefined;
        }
        if (this.items.length > 0) {
            this.items[0] = last;
            let parent = 0;
            for (;;) {
                const left = parent * 2 + 1;
                const right = left + 1;
                let smallest = parent;
                if (left < this.items.length && this.items[left].priority < this.items[smallest].priority) {
                    smallest = left;
                }
                if (right < this.items.length && this.items[right].priority < this.items[smallest].priority) {
                    smallest = right;
                }
                if (smallest === parent) {
                    break;
                }
                [this.items[parent], this.items[smallest]] = [this.items[smallest], this.items[parent]];
                parent = smallest;
            }
        }
        return top.item;
    }
}
