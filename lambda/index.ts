import { SecretsManager, SNS } from "aws-sdk";
import { ThinQApi } from "./api";
import { URL } from "url";

export const handler = async (): Promise<void> => {
  try {
    const { SecretString } = await new SecretsManager({ region: "us-east-1" })
      .getSecretValue({ SecretId: "live/thinq-notifier/lg" })
      .promise();
    const { username, password, clientId } = JSON.parse(SecretString!);

    const api = new ThinQApi();
    api.setUsernamePassword(username, password);
    await api.ready();

    const thresholdHours = Number(process.env.NOTIFICATION_THRESHOLD_HOURS);
    const thresholdTime = new Date();
    thresholdTime.setHours(new Date().getHours() - thresholdHours);

    const res = await api.httpClient.request({
      method: "GET",
      url: new URL("service/users/push/send-Backward-history", api.baseUrl)
        .href,
      headers: {
        ...api.defaultHeaders,
        "x-client-id": clientId,
      },
    });

    const events = res.data.result.pushSendList as Event[];
    console.log(`Successfully retrieved ThinQ event history. # of events: ${events.length}`);
    if (events.length && !!events[0].sendDate) {
      const mostRecentEvent = events[0];
      const eventDate = new Date(Number(mostRecentEvent.sendDate) * 1000);
      const eventMessage = JSON.parse(mostRecentEvent.message) as EventMessage;
      console.log(`Most recent event was at ${eventDate.toLocaleString()}`);

      if (eventDate < thresholdTime && isWasherEvent(eventMessage)) {
        console.log("Sending notification that washer needs to be unloaded.");
        await new SNS({ region: "us-east-1" })
          .publish({
            Message: `Hello,\n\nThe washer finished more than ${thresholdHours} hours ago.\n\nDon't forget to unload the clothes!`,
            TopicArn: process.env.TOPIC_ARN,
          })
          .promise();
      }
    }
  } catch (e: any) {
    console.error(`Uncaught exception: ${e.message}`);
  }
};

function isWasherEvent(eventMessage: EventMessage): boolean {
  return (
    eventMessage.extra.type === "201" ||
    eventMessage.aps.alert.body
      .toLocaleLowerCase()
      .startsWith("washer has finished a cycle ")
  );
}

interface Event {
  message: string;
  sendDate: string;
}

interface EventMessage {
  aps: {
    alert: {
      title: string;
      body: string;
    };
  };
  extra: {
    type: string;
  };
}

handler();
