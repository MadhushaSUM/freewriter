/**
 * @freewriter/core — Typed Event Emitter
 *
 * A lightweight, fully-typed event emitter implementing the Observer pattern.
 * Zero external dependencies. Designed to decouple state mutations from
 * rendering and UI updates.
 *
 * Usage:
 *   const emitter = new EventEmitter<{ change: { value: number } }>();
 *   const unsub = emitter.on('change', (data) => console.log(data.value));
 *   emitter.emit('change', { value: 42 });
 *   unsub(); // unsubscribe
 */

// ─── Types ───────────────────────────────────────────────────────────

/**
 * Constraint for the event map generic parameter.
 * Keys are event names, values are the payload types.
 * Uses a mapped type to be compatible with strict TypeScript interfaces
 * (which lack an implicit index signature).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EventMap = { [key: string]: any };

/** A handler function for a given event payload */
export type EventHandler<T> = (data: T) => void;

/** An unsubscribe function returned by `on()` */
export type Unsubscribe = () => void;

// ─── Event Emitter ───────────────────────────────────────────────────

/**
 * A generic, typed event emitter.
 *
 * @typeParam T — An event map where keys are event names and values
 *               are the corresponding payload types.
 *
 * @example
 * ```ts
 * interface MyEvents {
 *   'doc-change': { document: FreewriterDocument };
 *   'cursor-move': { position: DocumentPosition };
 * }
 *
 * const emitter = new EventEmitter<MyEvents>();
 * emitter.on('doc-change', ({ document }) => render(document));
 * ```
 */
export class EventEmitter<T extends EventMap> {
  /**
   * Internal store: event name → Set of handler functions.
   * Using a Set ensures O(1) add/remove and prevents duplicate registrations.
   */
  private readonly listeners = new Map<keyof T, Set<EventHandler<never>>>();

  /**
   * Registers a handler for the given event.
   *
   * @returns An unsubscribe function. Call it to remove the handler.
   */
  on<K extends keyof T>(event: K, handler: EventHandler<T[K]>): Unsubscribe {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }

    const castHandler = handler as EventHandler<never>;
    set.add(castHandler);

    // Return an unsubscribe function (idempotent)
    return () => {
      set!.delete(castHandler);
      if (set!.size === 0) {
        this.listeners.delete(event);
      }
    };
  }

  /**
   * Removes a specific handler for the given event.
   * No-op if the handler is not registered.
   */
  off<K extends keyof T>(event: K, handler: EventHandler<T[K]>): void {
    const set = this.listeners.get(event);
    if (!set) return;

    set.delete(handler as EventHandler<never>);
    if (set.size === 0) {
      this.listeners.delete(event);
    }
  }

  /**
   * Emits an event, calling all registered handlers synchronously
   * in the order they were registered.
   */
  emit<K extends keyof T>(event: K, data: T[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;

    // Iterate over a snapshot to allow handlers to unsubscribe safely
    for (const handler of [...set]) {
      (handler as EventHandler<T[K]>)(data);
    }
  }

  /**
   * Removes all handlers for a specific event, or all events if
   * no event name is provided.
   */
  removeAll(event?: keyof T): void {
    if (event !== undefined) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Returns the number of handlers registered for the given event.
   */
  listenerCount(event: keyof T): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}
