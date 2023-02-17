type Environment = 'development' | 'staging' | 'testing' | 'qa' | 'production' | 'master' | 'main';

import { BaseCloudfront, BaseCloudfrontArgs } from '../cloudfront';

const shortEnvironments = {
  development: 'dev',
  staging: 'stg',
  testing: 'tst',
  qa: 'qa',
  master: 'prd',
  main: 'prd',
  production: 'prd',
  management: 'mgt',
};
export default (): BaseCloudfrontArgs => {
  const environment: string = process.env.ENVIRONMENT || 'development';
  // @ts-ignore
  const env: string = shortEnvironments[environment];
  let serviceName = null;
  let subDomainName = null;

  if (process.env.APP_NAME) {
    serviceName = ['main', 'master', 'production'].includes(environment)
      ? process.env.APP_NAME
      : `${process.env.APP_NAME}-${env}`;
  }

  subDomainName = process.env.APP_SUBDOMAIN_NAME;

  const domainUrl =
    `${subDomainName || serviceName}.${process.env.APP_DOMAIN_URL}` || 'domain-url.com';

  return <BaseCloudfrontArgs>{
    environment,
    projectName: serviceName,
    dirPath: process.env.APP_DIR_PATH || '../dist',
    indexDocument: process.env.APP_INDEX_DOCUMENT || 'index.html',
    errorDocument: process.env.APP_ERROR_DOCUMENT || 'error.html',
    debug: process.env.PULUMI_DEBUG === 'true',
    domainUrl,
    ssl: {
      enabled: process.env.SSL_ENABLED === 'true',
      certificateArn:
        process.env.SSL_CERTIFICATE_ARN ||
        'arn:aws:iam::187416307283:server-certificate/test_cert_rab3wuqwgja25ct3n4jdj2tzu4',
    },
    cloudflare: {
      zoneId: process.env.CLOUDFLARE_ZONE_ID || 'zone-id',
      record: {
        enabled: process.env.CLOUDFLARE_RECORD_ENABLED === 'true',
      },
      acl: {
        enabled: process.env.CLOUDFLARE_ACL_ENABLED === 'true',
        rules: [
          {
            name: 'Admin IP',
            value: process.env.CLOUDFLARE_IP_ADMIN || '127.0.0.1',
          },
          {
            name: 'Development IP',
            value: process.env.CLOUDFLARE_IP_DEVELOPMENT || '127.0.0.1',
          },
          {
            name: 'Cluster Bastion Host',
            value: process.env.AWS_CLUSTER_IP_BASTION_HOST || '127.0.0.1',
          },
        ],
      },
    },
  };
};
