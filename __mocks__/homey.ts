'use strict';

import { EventEmitter } from 'node:events';

class App extends EventEmitter {
  log = jest.fn();

  error = jest.fn();

  homey!: unknown;
}

export { App };
export default { App };
