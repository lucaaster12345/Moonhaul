export class SeededRandom {
  private state: number;

  constructor(seed = Date.now()) {
    this.state = seed >>> 0 || 1;
  }

  next(): number {
    this.state += 0x6d2b79f5;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  pick<T>(items: T[]): T {
    if (!items.length) throw new Error("Cannot pick from an empty list");
    return items[Math.floor(this.next() * items.length)]!;
  }
}
