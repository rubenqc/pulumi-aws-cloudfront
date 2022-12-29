import * as cloudflare from '@pulumi/cloudflare';
import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as synced_folder from '@pulumi/synced-folder';
import * as random from '@pulumi/random';

import getConfig from './config/config';

// Import the program's configuration settings.
const config = new pulumi.Config();
const projectConfig = getConfig(); // get project config
const path = config.get('path') || '../dist';
const projectName = projectConfig.project.name;
const indexDocument = projectConfig.project.indexFile;
const errorDocument = projectConfig.project.errorFile;

// Get Stack
const stack = pulumi.getStack();

// Create bucket name
const bucketName = new random.RandomPet(`${projectName}-${stack}`);

// Create an S3 bucket and configure it as a website.
const bucket = new aws.s3.Bucket(`${projectName}-${stack}`, {
  acl: 'public-read',
  bucket: bucketName,
  website: {
    indexDocument: indexDocument,
    errorDocument: errorDocument,
  },
});

// Use a synced folder to manage the files of the website.
const bucketFolder = new synced_folder.S3BucketFolder('bucket-folder', {
  path: path,
  bucketName: bucket.bucket,
  acl: 'public-read',
});

// Create a CloudFront CDN to distribute and cache the website.
const cdn = new aws.cloudfront.Distribution('cdn', {
  enabled: true,
  origins: [
    {
      originId: bucket.arn,
      domainName: bucket.websiteEndpoint,
      customOriginConfig: {
        originProtocolPolicy: 'http-only',
        httpPort: 80,
        httpsPort: 443,
        originSslProtocols: ['TLSv1.2'],
      },
    },
  ],
  defaultCacheBehavior: {
    targetOriginId: bucket.arn,
    viewerProtocolPolicy: 'redirect-to-https',
    allowedMethods: ['GET', 'HEAD', 'OPTIONS'],
    cachedMethods: ['GET', 'HEAD', 'OPTIONS'],
    defaultTtl: 600,
    maxTtl: 600,
    minTtl: 600,
    forwardedValues: {
      queryString: true,
      cookies: {
        forward: 'all',
      },
    },
  },
  priceClass: 'PriceClass_All',
  customErrorResponses: [
    {
      errorCode: 404,
      responseCode: 404,
      responsePagePath: `/${errorDocument}`,
    },
  ],
  restrictions: {
    geoRestriction: {
      restrictionType: 'none',
    },
  },
  viewerCertificate: {
    cloudfrontDefaultCertificate: true,
  },
});

if (projectConfig.dns.cloudflare.enabled) {
  const cfProvider = new cloudflare.Provider('cloudflare', {
    apiKey: process.env.CLOUDFLARE_API_KEY,
    email: process.env.CLOUDFLARE_EMAIL,
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
  });

  const record = new cloudflare.Record(
    projectConfig.dns.cloudflare.domain,
    {
      name: projectConfig.dns.cloudflare.recordName,
      zoneId: projectConfig.dns.cloudflare.zoneId,
      type: projectConfig.dns.cloudflare.recordType,
      value: cdn.domainName,
      ttl: 3600,
    },
    {
      provider: cfProvider,
    },
  );
}

// Export the URLs and hostnames of the bucket and distribution.
export const originURL = pulumi.interpolate`http://${bucket.websiteEndpoint}`;
export const originHostname = bucket.websiteEndpoint;
export const cdnURL = pulumi.interpolate`https://${cdn.domainName}`;
export const cdnHostname = cdn.domainName;
