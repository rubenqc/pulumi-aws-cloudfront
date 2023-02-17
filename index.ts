import getConfig from './config/config';

import { BaseCloudfront } from './cloudfront';

export = async () => {
  // Get project config
  const config = getConfig();

  // Debug config
  if (config.debug) {
    console.log(JSON.stringify(config));
  }

  // Setup service
  const service = new BaseCloudfront(config);

  // Deploy service
  await service.deploy();
};
