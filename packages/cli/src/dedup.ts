/**
 * Insertion-ordered Set with a size bound. `add` refreshes an existing key to most-recent,
 * so eviction drops the least recently seen key. Serialises to a plain array (oldest first).
 */
export class BoundedSet {
  private set: Set<string>;
  constructor(readonly limit: number, init: Iterable<string> = []) {
    this.set = new Set(init);
    this.trim();
  }
  has(k: string): boolean {
    return this.set.has(k);
  }
  /** Returns true if the key was new. */
  add(k: string): boolean {
    if (this.set.has(k)) {
      this.set.delete(k);
      this.set.add(k);
      return false;
    }
    this.set.add(k);
    // Trim lazily in batches to keep add O(1) amortised.
    if (this.set.size > this.limit * 1.25) this.trim();
    return true;
  }
  get size(): number {
    return this.set.size;
  }
  trim(): void {
    let excess = this.set.size - this.limit;
    if (excess <= 0) return;
    for (const k of this.set) {
      if (excess-- <= 0) break;
      this.set.delete(k);
    }
  }
  toJSON(): string[] {
    this.trim();
    return [...this.set];
  }
}
