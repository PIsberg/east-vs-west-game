import { Unit } from '../types';

export class SpatialHash {
    cellSize: number;
    buckets: Map<string, Unit[]>;

    constructor(cellSize: number) {
        this.cellSize = cellSize;
        this.buckets = new Map();
    }

    clear() {
        this.buckets.clear();
    }

    add(unit: Unit) {
        const key = `${Math.floor(unit.position.x / this.cellSize)},${Math.floor(unit.position.y / this.cellSize)}`;
        if (!this.buckets.has(key)) {
            this.buckets.set(key, []);
        }
        this.buckets.get(key)!.push(unit);
    }

    query(x: number, y: number, radius: number): Unit[] {
        const startX = Math.floor((x - radius) / this.cellSize);
        const endX = Math.floor((x + radius) / this.cellSize);
        const startY = Math.floor((y - radius) / this.cellSize);
        const endY = Math.floor((y + radius) / this.cellSize);

        const results: Unit[] = [];
        for (let i = startX; i <= endX; i++) {
            for (let j = startY; j <= endY; j++) {
                const bucket = this.buckets.get(`${i},${j}`);
                if (bucket) {
                    // Push individually to avoid spreadsheet operator overhead in hot loop?
                    // results.push(...bucket) is fine for JS engine usually.
                    for (let k = 0; k < bucket.length; k++) results.push(bucket[k]);
                }
            }
        }
        return results;
    }
}
