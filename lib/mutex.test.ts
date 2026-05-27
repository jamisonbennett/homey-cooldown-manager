'use strict';

import { Mutex } from './mutex';

describe('Mutex', () => {
  it('serializes concurrent runners', async () => {
    const mutex = new Mutex();
    let concurrent = 0;
    let maxConcurrent = 0;

    await Promise.all(
      [1, 2, 3].map(async () => mutex.runExclusive(async () => {
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise<void>((resolve) => {
          setImmediate(resolve);
        });
        concurrent -= 1;
      })),
    );

    expect(maxConcurrent).toBe(1);
  });

  it('releases the lock when the runner throws', async () => {
    const mutex = new Mutex();

    await expect(mutex.runExclusive(async () => {
      throw new Error('fail');
    })).rejects.toThrow('fail');

    await expect(mutex.runExclusive(async () => true)).resolves.toBe(true);
  });
});
