type Config = {
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
