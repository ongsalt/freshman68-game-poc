// Gemini wrote this, K must be sortable btw
export class SortedMap<K, V> {
	#map: Map<K, V>;
	#keys: K[];

	constructor() {
		this.#map = new Map<K, V>();
		this.#keys = [];
	}

	public set(key: K, value: V): this {
		if (!this.#map.has(key)) {
			// Binary search to find the insertion point for the new key
			let low = 0;
			let high = this.#keys.length - 1;
			let insertIndex = 0;

			while (low <= high) {
				const mid = Math.floor((low + high) / 2);
				if (key < this.#keys[mid]) {
					high = mid - 1;
				} else {
					low = mid + 1;
				}
			}
			insertIndex = low;
			this.#keys.splice(insertIndex, 0, key);
		}
		this.#map.set(key, value);
		return this; // Allows chaining
	}

	public get(key: K): V | undefined {
		return this.#map.get(key);
	}

	public has(key: K): boolean {
		return this.#map.has(key);
	}

	public delete(key: K): boolean {
		if (this.#map.delete(key)) {
			const index = this.#keys.indexOf(key);
			if (index > -1) {
				this.#keys.splice(index, 1);
			}
			return true;
		}
		return false;
	}

	public get size(): number {
		return this.#map.size;
	}

	public clear(): void {
		this.#map.clear();
		this.#keys = [];
	}

	public *keys(): IterableIterator<K> {
		for (const key of this.#keys) {
			yield key;
		}
	}

	public *values(): IterableIterator<V> {
		for (const key of this.#keys) {
			yield this.#map.get(key)!;
		}
	}

	public *entries(): IterableIterator<[K, V]> {
		for (const key of this.#keys) {
			yield [key, this.#map.get(key)!];
		}
	}

	public [Symbol.iterator](): IterableIterator<[K, V]> {
		return this.entries();
	}
}

