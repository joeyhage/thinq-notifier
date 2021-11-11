import { SNS, SSM } from "aws-sdk";
import { DeviceType } from "homebridge-lg-thinq/dist/lib/constants";
import { Device } from "homebridge-lg-thinq/dist/lib/Device";
import { URL } from "url";
import { ThinQApi } from "./api";

export const handler = async (): Promise<void> => {
  const region = process.env.AWS_REGION;
  try {
    const { username, password, clientId } = await getAppSecrets(region);

    const api = new ThinQApi();
    api.setUsernamePassword(username, password);
    await api.ready();

    const dryer = await findDryer(api);
    const events = await getRecentEvents(api, clientId);

    if (isDryerOff(dryer) && events.length && !!events[0].sendDate) {
      const mostRecentEvent = events[0];
      const eventDate = new Date(Number(mostRecentEvent.sendDate) * 1000);
      const eventMessage = JSON.parse(mostRecentEvent.message) as EventMessage;
      console.log(`Most recent event was at ${eventDate.toLocaleString()}`);

      const thresholdHours = Number(process.env.NOTIFICATION_THRESHOLD_HRS);
      const thresholdTime = new Date();
      thresholdTime.setHours(new Date().getHours() - thresholdHours);

      if (
        eventDate < thresholdTime &&
        shouldSendRepeatNotification(thresholdTime) &&
        isWasherEvent(eventMessage)
      ) {
        await publishMessage(region, thresholdHours);
      }
    }
  } catch (e: any) {
    console.error(`Uncaught exception: ${e.message}`);
  }
};

async function getAppSecrets(
  region = "us-east-1"
): Promise<Record<string, string>> {
  const { Parameter } = await new SSM({ region })
    .getParameter({ Name: process.env.SECRET_NAME!, WithDecryption: true })
    .promise();
  return JSON.parse(Parameter?.Value || "{}");
}

async function findDryer(api: ThinQApi) {
  return (await api.getListDevices())
    .map((device) => new Device(device))
    .find((device) => Number(device.data.deviceType) === DeviceType.DRYER);
}

async function getRecentEvents(
  api: ThinQApi,
  clientId: string
): Promise<Event[]> {
  const res = await api.httpClient.request({
    method: "GET",
    url: new URL("service/users/push/send-Backward-history", api.baseUrl).href,
    headers: {
      ...api.defaultHeaders,
      "x-client-id": clientId,
    },
  });

  const events = res.data.result.pushSendList as Event[];
  console.log(
    `Successfully retrieved ThinQ event history. # of events: ${events.length}`
  );
  return events;
}

async function publishMessage(
  region = "us-east-1",
  thresholdHours: number
): Promise<void> {
  console.log("Sending notification that washer needs to be unloaded.");
  await new SNS({ region })
    .publish({
      Message: `Hello,\n\nThe washer finished more than ${thresholdHours} hours ago.\n\nDon't forget to unload the clothes!`,
      TopicArn: process.env.TOPIC_ARN,
    })
    .promise();
}

function isWasherEvent(eventMessage: EventMessage): boolean {
  console.log(`Event type: ${eventMessage.extra.type}`);
  return (
    Number(eventMessage.extra.type) === DeviceType.WASHER ||
    Number(eventMessage.extra.type) === DeviceType.WASHER_NEW ||
    Number(eventMessage.extra.type) === DeviceType.WASH_TOWER
  );
}

function isDryerOff(dryer?: Device): boolean {
  console.log(`Dryer state: ${dryer?.snapshot?.washerDryer?.state}`);
  return (
    !dryer || NOT_RUNNING_STATUS.includes(dryer.snapshot.washerDryer.state)
  );
}

function shouldSendRepeatNotification(thresholdTime: Date): boolean {
  const msSinceThreshold = Date.now() - thresholdTime.getTime();
  const hoursSinceThreshold = msSinceThreshold / (60 * 60 * 1000);
  const notificationFreqHrs = Number(process.env.NOTIFICATION_FREQ_HRS);
  console.log({ hoursSinceThreshold, notificationFreqHrs });
  return hoursSinceThreshold % notificationFreqHrs < 1;
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

const NOT_RUNNING_STATUS = [
  "COOLDOWN",
  "POWEROFF",
  "POWERFAIL",
  "INITIAL",
  "PAUSE",
  "AUDIBLE_DIAGNOSIS",
  "FIRMWARE",
  "COURSE_DOWNLOAD",
  "ERROR",
];
