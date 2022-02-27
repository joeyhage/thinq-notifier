import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import * as lambda from "aws-cdk-lib/aws-lambda-nodejs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as cdk from "aws-cdk-lib/core";
import { Construct } from "constructs";
import * as path from "path";

export class ThinqNotifierStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const topic = new sns.Topic(this, "ThinqNotificationTopic", {
      displayName: "ThinQ notification topic",
    });

    const secretName = "/live/thinq-notifier/lg";

    const fn = new lambda.NodejsFunction(this, "LgNotifierLambda", {
      runtime: Runtime.NODEJS_14_X,
      entry: path.resolve(__dirname, "../lambda/index.ts"),
      timeout: cdk.Duration.seconds(10),
      bundling: {
        minify: true,
        sourceMap: true,
        sourceMapMode: lambda.SourceMapMode.INLINE,
        target: "es2018",
        externalModules: ["aws-sdk"],
      },
      environment: {
        NOTIFICATION_FREQ_HRS: "3",
        NOTIFICATION_THRESHOLD_HRS: "3",
        MAX_NOTIFICATIONS: "2",
        QUIET_HOUR_START: "21", // 24 hour format
        QUIET_HOUR_END: "10", // 24 hour format
        SECRET_NAME: secretName, // From systems manager parameter store
        TIMEZONE: "America/Chicago", // IANA Timezone name
        TOPIC_ARN: topic.topicArn,
      },
    });

    const parameter = ssm.StringParameter.fromSecureStringParameterAttributes(
      this,
      "ThinQLogin",
      { parameterName: secretName, version: 2 }
    );
    parameter.grantRead(fn.role as iam.IGrantable);

    const eventRule = new events.Rule(this, "LambdaScheduleRule", {
      ruleName: "thinq-check-hourly",
      schedule: events.Schedule.cron({ minute: "0" }),
      targets: [new targets.LambdaFunction(fn)],
    });

    targets.addLambdaPermission(eventRule, fn);

    topic.addSubscription(
      new subscriptions.EmailSubscription(process.env.SNS_EMAIL!)
    );
    topic.grantPublish(fn.role as iam.IGrantable);
  }
}
