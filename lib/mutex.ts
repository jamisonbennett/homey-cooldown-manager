'use strict';

/**
 * Serializes async work so only one caller runs at a time.
 * Used to make read–modify–write on shared cooldown state atomic under
 * concurrent Flow handlers.
 */
export class Mutex {
  private tail: Promise<void> = Promise.resolve();

  runExclusive<T>(fn: () => T | Promise<T>): Promise<T> {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const previous = this.tail;
    this.tail = previous.then(() => gate);

    return previous.then(() => fn()).finally(() => {
      release();
    });
  }
}
