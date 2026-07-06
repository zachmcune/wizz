// Tiny typed pub/sub. Presentation/UI/audio subscribe; the sim never subscribes.
export type Listener<T> = (event: T) => void;

export class EventBus<T> {
  private listeners: Listener<T>[] = [];

  on(fn: Listener<T>): () => void {
    this.listeners.push(fn);
    return () => {
      const i = this.listeners.indexOf(fn);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  emit(event: T): void {
    for (const fn of this.listeners) fn(event);
  }

  clear(): void {
    this.listeners.length = 0;
  }
}
