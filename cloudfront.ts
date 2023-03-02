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
        environment: 'development',
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
      environment,
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
      acl: 'private',
      versioning: {
        enabled: true,
      },
      serverSideEncryptionConfiguration: {
        rule: {
          applyServerSideEncryptionByDefault: {
            sseAlgorithm: 'AES256',
          },
        },
      },
      website: {
        indexDocument: indexDocument,
        errorDocument: indexDocument,
      },
    });

    const bucketPublicAccessBlock = new aws.s3.BucketPublicAccessBlock(
      's3BucketPublicAccessPolicy',
      {
        bucket: bucket.id,
        blockPublicAcls: true,
        blockPublicPolicy: true,
        ignorePublicAcls: true,
        restrictPublicBuckets: true,
      },
    );

    // Use a synced folder to manage the files of the website.
    const bucketFolder = new synced_folder.S3BucketFolder('bucket-folder', {
      path: dirPath,
      bucketName: bucket.bucket,
      acl: 'private',
    });

    const currentPartition = await aws.getPartition({});
    const currentAccount = await aws.getCallerIdentity({});
    const region = await aws.getRegion({});

    const originResponseLogGroup = new aws.cloudwatch.LogGroup('origin-response-log-group', {
      name: `/aws/lambda/${projectName}-originResponse`,
      tags: {
        Application: projectName,
        Environment: environment,
      },
    });

    // Iam Role Lambda Function
    const iamRoleLambdaExecution = new aws.iam.Role('iamRoleLambdaExecution', {
      name: `${projectName}-${region.name}-lambdaRole`,
      path: '/',
      assumeRolePolicy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Principal: {
              Service: ['lambda.amazonaws.com', 'edgelambda.amazonaws.com'],
            },
          },
        ],
      }),
    });

    const policyLambdaExecution = new aws.iam.Policy('policyLambdaExecution', {
      name: `${projectName}-lambda`,
      policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Action: ['logs:CreateLogStream', 'logs:CreateLogGroup'],
            Effect: 'Allow',
            Resource: `arn:${currentPartition.partition}:logs:${region.name}:${currentAccount.accountId}:log-group:/aws/lambda/${projectName}*:*`,
          },
          {
            Action: ['logs:PutLogEvents'],
            Effect: 'Allow',
            Resource: `arn:${currentPartition.partition}:logs:${region.name}:${currentAccount.accountId}:log-group:/aws/lambda/${projectName}*:*:*`,
          },
          {
            Action: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
            Effect: 'Allow',
            Resource: `arn:${currentPartition.partition}:logs:*:*:*`,
          },
        ],
      }),
    });

    const attachPolicy = new aws.iam.PolicyAttachment('attach-policy', {
      roles: [iamRoleLambdaExecution.name],
      policyArn: policyLambdaExecution.arn,
    });

    // Lambda Origin Response
    const originResponseLambda = new aws.lambda.Function(
      'origin-response',
      {
        code: new pulumi.asset.AssetArchive({
          '.': new pulumi.asset.FileArchive('./handler'),
        }),
        name: `${projectName}-originResponse`,
        handler: 'originResponse.js',
        runtime: 'nodejs14.x',
        memorySize: 128,
        timeout: 5,
        publish: true,
        role: iamRoleLambdaExecution.arn,
      },
      {
        dependsOn: originResponseLogGroup,
      },
    );

    const originAccessControl = new aws.cloudfront.OriginAccessControl('example', {
      name: `access-control-${projectName}`,
      description: 'Cloudfront access control',
      originAccessControlOriginType: 's3',
      signingBehavior: 'always',
      signingProtocol: 'sigv4',
    });

    // Create a CloudFront CDN to distribute and cache the website.
    const cdn = new aws.cloudfront.Distribution('cdn', {
      enabled: true,
      origins: [
        {
          domainName: bucket.websiteEndpoint,
          originId: bucket.arn,
          originAccessControlId: originAccessControl.id,
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
        lambdaFunctionAssociations: [
          {
            eventType: 'origin-response',
            lambdaArn: originResponseLambda.qualifiedArn,
          },
        ],
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

    const bucketPolicy = new aws.s3.BucketPolicy('bucketPolicy', {
      bucket: bucket.id,
      policy: pulumi.jsonStringify({
        Version: '2008-10-17',
        Id: 'BUCKET-POLICY',
        Statement: [
          {
            Sid: 'AllowSSLRequestsOnly',
            Effect: 'Deny',
            Principal: '*',
            Action: ['s3:*'],
            Resource: [pulumi.interpolate`${bucket.arn}/*`, pulumi.interpolate`${bucket.arn}`],
            Condition: {
              Bool: {
                'aws:SecureTransport': 'false',
              },
            },
          },
          {
            Sid: '1',
            Effect: 'Allow',
            Principal: {
              Service: 'cloudfront.amazonaws.com',
            },
            Action: 's3:GetObject',
            Resource: [pulumi.interpolate`${bucket.arn}/*`, pulumi.interpolate`${bucket.arn}`],
            Condition: {
              StringEquals: {
                'AWS:SourceArn': cdn.arn,
              },
            },
          },
          {
            Sid: '2',
            Effect: 'Allow',
            Principal: {
              AWS: [currentAccount.arn],
            },
            Action: [
              's3:GetObject',
              's3:DeleteObject',
              's3:PutObject',
              's3:PutBucketWebsite',
              's3:GetBucketWebsite',
              's3:DeleteBucketWebsite',
            ],
            Resource: [pulumi.interpolate`${bucket.arn}/*`, pulumi.interpolate`${bucket.arn}`],
          },
        ],
      }),
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
  environment: string;
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
