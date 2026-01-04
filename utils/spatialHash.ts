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
        const results: Unit[] = [];
        this.queryCallback(x, y, radius, (u) => results.push(u));
        return results;
    }

    queryCallback(x: number, y: number, radius: number, callback: (unit: Unit) => void) {
        const startX = Math.floor((x - radius) / this.cellSize);
        const endX = Math.floor((x + radius) / this.cellSize);
        const startY = Math.floor((y - radius) / this.cellSize);
        const endY = Math.floor((y + radius) / this.cellSize);

        for (let i = startX; i <= endX; i++) {
            for (let j = startY; j <= endY; j++) {
                const bucket = this.buckets.get(`${i},${j}`);
                if (bucket) {
                    for (let k = 0; k < bucket.length; k++) {
                        callback(bucket[k]);
                    }
                }
            }
        }
    }
}
