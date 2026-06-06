'use strict';

import Homey from 'homey';
import type { FlowConfigError } from './lib/flow-config-errors';

type DisplayContext = {
  timezone: string;
  language: string;
};

type CooldownManagerApp = Homey.App & {
  getDisplayContext(): DisplayContext;
  getFlowConfigErrors(): Promise<FlowConfigError[]>;
};

export = {
  async getDisplayContext({ homey }: { homey: { app: CooldownManagerApp } }) {
    return homey.app.getDisplayContext();
  },

  async getFlowConfigErrors({ homey }: { homey: { app: CooldownManagerApp } }) {
    const errors = await homey.app.getFlowConfigErrors();
    return { errors };
  },
};
