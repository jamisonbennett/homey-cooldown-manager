'use strict';

export default class InvalidCooldownDurationError extends Error {
  constructor() {
    super('InvalidCooldownDurationError');
    this.name = 'InvalidCooldownDurationError';
  }
}
