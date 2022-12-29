type Config = {
  project: {
    name: string;
    stack: string;
    description: string;
    indexFile: string;
    errorFile: string;
    distPath: string;
  };
  dns: {
    cloudflare: {
      enabled: boolean;
      domain: string;
      recordName: string;
      recordType: string;
      zoneId: string;
    };
  };
};

export default (): Config => ({
  project: {
    name: process.env.PROJECT_NAME || 'test-project',
    stack: process.env.PROJECT_STACK || 'dev',
    description: process.env.PROJECT_DESCRIPTION || 'project description',
    indexFile: process.env.PROJECT_INDEX_FILE || 'index.html',
    errorFile: process.env.PROJECT_ERROR_FILE || 'error.html',
    distPath: process.env.PROJECT_DIST_PATH || '../dist',
  },
  dns: {
    cloudflare: {
      enabled: process.env.CLOUDFLARE_ENABLED === 'true',
      domain: process.env.CLOUDFLARE_DOMAIN || 'domain_value',
      recordType: process.env.CLOUDFLARE_RECORD_TYPE || 'CNAME',
      recordName: process.env.CLOUDFLARE_RECORD_NAME || 'record_name',
      zoneId: process.env.CLOUDFLARE_ZONE_ID || 'zone_id',
    },
  },
});
