import * as pulumi from '@pulumi/pulumi';
import * as random from '@pulumi/random';
import * as cloudflare from '@pulumi/cloudflare';
import * as aws from '@pulumi/aws';
import * as synced_folder from '@pulumi/synced-folder';
import * as domain from 'domain';

export class BaseCloudfront {
  readonly args: BaseCloudfrontArgs;
  constructor(args: BaseCloudfrontArgs) {
    this.args = Object.assign(
      {
        projectName: 'project-test',
        dirPath: './dist',
        indexDocument: 'index.html',
        errorDocument: 'error.html',
        ssl: {
          enabled: false,
        },
        cloudflare: {
          zoneId: 'example-zone-id',
          record: {
            enabled: false,
            name: 'test',
          },
          acl: {
            enabled: false,
            rules: [],
          },
        },
      },
      args,
    );
  }
  async deploy() {
    const {
      projectName,
      dirPath,
      indexDocument,
      errorDocument,
      domainUrl,
      cloudflare: cf,
      ssl,
    } = this.args;

    const bucketName = new random.RandomPet('random', {
      prefix: projectName,
      separator: '-',
      length: 1,
    });

    // Create an S3 bucket and configure it as a website.
    const bucket = new aws.s3.Bucket('bucket', {
      // @ts-ignore
      bucket: bucketName,
      acl: 'public-read',
      website: {
        indexDocument: indexDocument,
      },
    });

    // Generate Origin Access Identity to access the private s3 bucket.
    const originAccessIdentity = new aws.cloudfront.OriginAccessIdentity('originAccessIdentity', {
      comment: 'this is needed to setup s3 polices and make s3 not public.',
    });

    const bucketPolicy = new aws.s3.BucketPolicy('bucketPolicy', {
      bucket: bucket.id,
      policy: pulumi.jsonStringify({
        Version: '2008-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: {
              AWS: originAccessIdentity.iamArn,
            }, // Only allow Cloudfront read access.
            Action: ['s3:GetObject'],
            Resource: [pulumi.interpolate`${bucket.arn}/*`], // Give Cloudfront access to the entire bucket.
          },
          // {
          //   Effect: 'Deny',
          //   Principal: '*',
          //   Action: ['s3:*'],
          //   Resource: [pulumi.interpolate`${bucket.arn}`, pulumi.interpolate`${bucket.arn}/*`],
          //   Condition: {
          //     Bool: {
          //       'aws:SecureTransport': 'false',
          //     },
          //   },
          // },
        ],
      }),
    });

    // Use a synced folder to manage the files of the website.
    const bucketFolder = new synced_folder.S3BucketFolder('bucket-folder', {
      path: dirPath,
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
      aliases: [domainUrl],
      viewerCertificate: {
        sslSupportMethod: 'sni-only',
        acmCertificateArn: ssl.enabled ? ssl.certificateArn : undefined,
        minimumProtocolVersion: 'TLSv1.2_2021',
      },
      httpVersion: 'http2',
    });

    if (cf.record.enabled || cf.acl.enabled) {
      const cfProvider = new cloudflare.Provider('cloudflare', {
        apiKey: process.env.CLOUDFLARE_API_KEY,
        email: process.env.CLOUDFLARE_EMAIL,
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      });

      if (cf.record.enabled) {
        const record = new cloudflare.Record(
          'cloudflare-record',
          {
            name: domainUrl,
            zoneId: cf.zoneId,
            type: 'CNAME',
            value: cdn.domainName,
            ttl: 1,
            proxied: true,
          },
          {
            provider: cfProvider,
          },
        );
      }

      if (cf.acl.enabled) {
        // Restrict access to these endpoints to requests from a known IP address range.
        const zoneLockdown = new cloudflare.ZoneLockdown(
          'zone-lockdown',
          {
            configurations: cf.acl.rules.map(({ value }) => ({
              target: 'ip',
              value,
            })),
            description: `Restrict access to ${projectName} webapp`,
            paused: false,
            urls: [`${domainUrl}/*`],
            zoneId: cf.zoneId,
          },
          {
            provider: cfProvider,
          },
        );
      }
    }

    return {
      cdnDomainName: cdn.domainName,
    };
  }
}

export interface BaseCloudfrontArgs {
  projectName: string;
  dirPath: string;
  indexDocument: string;
  errorDocument: string;
  domainUrl: string;
  debug: boolean;
  ssl: {
    enabled: boolean;
    certificateArn: string;
  };
  cloudflare: {
    zoneId: string;
    record: {
      enabled: boolean;
      name?: string;
    };
    acl: {
      enabled: boolean;
      rules: {
        name: string;
        value: string;
      }[];
    };
  };
}