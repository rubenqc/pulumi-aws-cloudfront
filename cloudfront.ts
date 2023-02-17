import * as random from '@pulumi/random';
import * as cloudflare from '@pulumi/cloudflare';
import * as aws from '@pulumi/aws';
import * as synced_folder from '@pulumi/synced-folder';

export class BaseCloudfront {
  readonly args: BaseCloudfrontArgs;
  constructor(args: BaseCloudfrontArgs) {
    this.args = Object.assign(
      {
        projectName: 'project-test',
        dirPath: './dist',
        indexDocument: 'index.html',
        errorDocument: 'error.html',
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
    } = this.args;

    // Create bucket name
    const bucketName = new random.RandomPet(projectName);

    // Create an S3 bucket and configure it as a website.
    const bucket = new aws.s3.Bucket('bucket', {
      acl: 'public-read',
      bucket: String(bucketName),
      website: {
        indexDocument,
        errorDocument,
      },
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
      viewerCertificate: {
        cloudfrontDefaultCertificate: true,
      },
    });

    if (cf.record && cf.record.enabled) {
      const cfProvider = new cloudflare.Provider('cloudflare', {
        apiKey: process.env.CLOUDFLARE_API_KEY,
        email: process.env.CLOUDFLARE_EMAIL,
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      });

      const record = new cloudflare.Record(
        'cloudflare-record',
        {
          name: domainUrl,
          zoneId: cf.zoneId,
          type: 'CNAME',
          value: cdn.domainName,
          ttl: 3600,
          proxied: true,
        },
        {
          provider: cfProvider,
        },
      );
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
