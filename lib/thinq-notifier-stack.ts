import * as events from "@aws-cdk/aws-events";
import * as targets from "@aws-cdk/aws-events-targets";
import { Runtime } from "@aws-cdk/aws-lambda";
import * as lambda from "@aws-cdk/aws-lambda-nodejs";
import * as secretsmanager from "@aws-cdk/aws-secretsmanager";
import * as sns from "@aws-cdk/aws-sns";
import * as subscriptions from "@aws-cdk/aws-sns-subscriptions";
import * as cdk from "@aws-cdk/core";
import * as iam from "@aws-cdk/aws-iam";
import * as path from "path";

export class ThinqNotifierStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const topic = new sns.Topic(this, "ThinqNotificationTopic", {
      displayName: "ThinQ notification topic",
    });

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
        NOTIFICATION_THRESHOLD_HOURS: "3",
        TOPIC_ARN: topic.topicArn,
      },
    });

    const secret = secretsmanager.Secret.fromSecretNameV2(
      this,
      "MyQLogin",
      "live/thinq-notifier/lg"
    );
    secret.grantRead(fn.role as iam.IGrantable);

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
