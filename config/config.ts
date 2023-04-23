import * as domain from 'domain';

type Environment = 'development' | 'staging' | 'testing' | 'qa' | 'production' | 'master' | 'main';

import { BaseCloudfront, BaseCloudfrontArgs } from '../cloudfront';

const shortEnvironments = {
  development: 'dev',
  staging: 'stg',
  testing: 'tst',
  qa: 'qa',
  production: 'prd',
  management: 'mgt',
};
export default (): BaseCloudfrontArgs => {
  let environment: string = process.env.ENVIRONMENT || 'development';
  environment = ['main', 'master'].includes(environment) ? 'production' : environment;
  // @ts-ignore
  const env: string = shortEnvironments[environment];
  let serviceName = null;
  let subDomainNames = null;
  let domainUrls: string[] = [];
  let responseHeadersAccessControlAllowOrigins: string;

  if (process.env.APP_NAME) {
    serviceName =
      environment === 'production' ? process.env.APP_NAME : `${process.env.APP_NAME}-${env}`;
  }

  subDomainNames = process.env.APP_SUBDOMAIN_NAMES
    ? String(process.env.APP_SUBDOMAIN_NAMES).trim()
    : '';

  if (process.env.APP_SUBDOMAIN_ENABLED === 'true') {
    domainUrls = subDomainNames
      ? subDomainNames
          .split(',')
          .map(
            (subDomainName) =>
              `${subDomainName.trim()}.${process.env.APP_DOMAIN_URL || 'domain-url.com'}`,
          )
      : [`${serviceName}.${process.env.APP_DOMAIN_URL}` || 'domain-url.com'];
  } else {
    domainUrls = [process.env.APP_DOMAIN_URL || 'domain-url.com'];
  }

  responseHeadersAccessControlAllowOrigins = process.env
    .AWS_RESPONSE_HEADERS_ACCESS_CONTROLL_ALLOW_ORIGINS
    ? String(process.env.AWS_RESPONSE_HEADERS_ACCESS_CONTROLL_ALLOW_ORIGINS).trim()
    : '*';

  return <BaseCloudfrontArgs>{
    environment,
    projectName: serviceName,
    dirPath: process.env.APP_DIR_PATH || '../dist',
    indexDocument: process.env.APP_INDEX_DOCUMENT || 'index.html',
    errorDocument: process.env.APP_ERROR_DOCUMENT || 'error.html',
    debug: process.env.PULUMI_DEBUG === 'true',
    domainUrls,
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
    responseHeaders: {
      corsConfig: {
        enabled: process.env.AWS_RESPONSE_HEADERS_CORS_CONFIG_ENABLED === 'true',
        value: {
          accessControlAllowCredentials: false,
          accessControlAllowHeaders: {
            items: ['*'],
          },
          accessControlAllowMethods: {
            items: ['GET'],
          },
          accessControlAllowOrigins: {
            items: responseHeadersAccessControlAllowOrigins
              .split(',')
              .map((responseHeaderAccessControlAllowOrigins) =>
                responseHeaderAccessControlAllowOrigins.trim(),
              ),
          },
          originOverride: true,
        },
      },
    },
  };
};
