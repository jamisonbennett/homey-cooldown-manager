'use strict';

/**
 * Serializes async work so only one caller runs at a time.
 * Used to make read–modify–write on shared cooldown state atomic under
 * concurrent Flow handlers.
 */
export default class Mutex {
  private tail: Promise<void> = Promise.resolve();

  runExclusive<T>(fn: () => T | Promise<T>): Promise<T> {
    const previous = this.tail;

    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });

    return previous.then(() => fn()).finally(() => {
      release();
    });
  }
}
