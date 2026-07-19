/** Typed-array-backed binary min-heap keyed on float time with uint32 payload. */
export class MinHeap {
  private times: Float64Array;
  private ids: Uint32Array;
  private n = 0;

  constructor(capacity = 1024) {
    this.times = new Float64Array(capacity);
    this.ids = new Uint32Array(capacity);
  }

  get size(): number {
    return this.n;
  }

  push(time: number, id: number): void {
    if (this.n === this.times.length) this.grow();
    let i = this.n++;
    this.times[i] = time;
    this.ids[i] = id;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.times[parent]! <= this.times[i]!) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): { time: number; id: number } | null {
    if (this.n === 0) return null;
    const top = { time: this.times[0]!, id: this.ids[0]! };
    this.n--;
    if (this.n > 0) {
      this.times[0] = this.times[this.n]!;
      this.ids[0] = this.ids[this.n]!;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let smallest = i;
        if (l < this.n && this.times[l]! < this.times[smallest]!) smallest = l;
        if (r < this.n && this.times[r]! < this.times[smallest]!) smallest = r;
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return top;
  }

  private swap(i: number, j: number): void {
    const t = this.times[i]!;
    this.times[i] = this.times[j]!;
    this.times[j] = t;
    const d = this.ids[i]!;
    this.ids[i] = this.ids[j]!;
    this.ids[j] = d;
  }

  private grow(): void {
    const times = new Float64Array(this.times.length * 2);
    times.set(this.times);
    this.times = times;
    const ids = new Uint32Array(this.ids.length * 2);
    ids.set(this.ids);
    this.ids = ids;
  }
}
