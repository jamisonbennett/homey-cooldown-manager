'use strict';

import Homey from 'homey';

type DisplayContext = {
  timezone: string;
  language: string;
};

type CooldownManagerApp = Homey.App & {
  getDisplayContext(): DisplayContext;
};

module.exports = {
  async getDisplayContext({ homey }: { homey: { app: CooldownManagerApp } }) {
    return homey.app.getDisplayContext();
  },
};
