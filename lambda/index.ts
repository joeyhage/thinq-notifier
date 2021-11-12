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
      const formattedEventDate = formatDate(eventDate, dryer?.data.timezoneCode);

      console.log(`Most recent event was at ${formattedEventDate}`);

      const thresholdHours = Number(process.env.NOTIFICATION_THRESHOLD_HRS);
      const thresholdTime = new Date();
      thresholdTime.setHours(new Date().getHours() - thresholdHours);

      if (
        eventDate < thresholdTime &&
        shouldSendRepeatNotification(thresholdTime) &&
        isWasherCycleFinished(eventMessage) &&
        !(await wasLatestWashTubClean(api, clientId, eventMessage))
      ) {
        await publishUnloadMessage(formattedEventDate, region);
      }
    } else if (typeof dryer === "undefined" || !events.length) {
      throw new Error("ThinQ API returned an unexpected response");
    }
  } catch (e: any) {
    console.error(`Uncaught exception`, e);
    await publishMessage(
      e.message || "Uncaught exception. Check logs.",
      region
    );
  }
};

function formatDate(date: Date, timezoneCode?: string): string {
  return new Intl.DateTimeFormat("default", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: true,
    timeZone: timezoneCode,
    timeZoneName: "short",
  }).format(date);
}

async function getAppSecrets(
  region = "us-east-1"
): Promise<Record<string, string>> {
  const { Parameter } = await new SSM({ region })
    .getParameter({ Name: process.env.SECRET_NAME!, WithDecryption: true })
    .promise();
  return JSON.parse(Parameter?.Value || "{}");
}

async function getThinqApi(
  api: ThinQApi,
  clientId: string,
  url: string
): Promise<any> {
  return api.httpClient.request({
    method: "GET",
    url: new URL(url, api.baseUrl).href,
    headers: {
      ...api.defaultHeaders,
      "x-client-id": clientId,
    },
  });
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
  const res = await getThinqApi(
    api,
    clientId,
    "service/users/push/send-Backward-history"
  );

  const events = res.data?.result?.pushSendList || ([] as Event[]);
  console.log(
    `Successfully retrieved ThinQ event history. # of events: ${events.length}`
  );
  return events;
}

async function publishUnloadMessage(
  datetime: string,
  region?: string
): Promise<void> {
  await publishMessage(
    `Hello,\n\nThe washer finished at ${datetime}.\n\nDon't forget to unload the clothes!`,
    region
  );
}

async function publishMessage(
  message: string,
  region = "us-east-1"
): Promise<void> {
  console.log(`Sending notification with message: ${message}`);
  await new SNS({ region })
    .publish({
      Message: message,
      TopicArn: process.env.TOPIC_ARN,
    })
    .promise();
}

function isWasherCycleFinished(eventMessage: EventMessage): boolean {
  console.log(
    `Device type for event: ${eventMessage.extra.type}, event code: ${eventMessage.extra.code}, device name: ${eventMessage.extra.alias}`
  );
  return (
    Number(eventMessage.extra.code) === SUCCESSFUL_WASH_CODE &&
    (Number(eventMessage.extra.type) === DeviceType.WASHER ||
      Number(eventMessage.extra.type) === DeviceType.WASHER_NEW ||
      Number(eventMessage.extra.type) === DeviceType.WASH_TOWER)
  );
}

async function wasLatestWashTubClean(
  api: ThinQApi,
  clientId: string,
  eventMessage: EventMessage
): Promise<boolean> {
  const res = await getThinqApi(
    api,
    clientId,
    `service/laundry/${eventMessage.extra.id}/energy-history?type=count&count=1&washerType=M&sorting=1`
  );
  if (!res.data?.result?.item?.[0]?.course) {
    throw new Error("Unable to determine the last wash type");
  }
  return res.data?.result?.item?.[0]?.course === "TUB_CLEAN";
}

function isDryerOff(dryer?: Device): boolean {
  console.log(`Dryer state: ${dryer?.snapshot?.washerDryer?.state}`);
  return (
    !dryer || NOT_RUNNING_STATUS.includes(dryer.snapshot.washerDryer.state)
  );
}

function shouldSendRepeatNotification(thresholdTime: Date): boolean {
  const notificationFreqHrs = Number(process.env.NOTIFICATION_FREQ_HRS);
  const maxNotifications = Number(process.env.MAX_NOTIFICATIONS);

  const msSinceThreshold = Date.now() - thresholdTime.getTime();
  const hoursSinceThreshold = msSinceThreshold / (60 * 60 * 1000);

  console.log({ hoursSinceThreshold, notificationFreqHrs, maxNotifications });
  return (
    hoursSinceThreshold % notificationFreqHrs < 1 &&
    Math.floor(hoursSinceThreshold / notificationFreqHrs) <= maxNotifications
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
    id: string;
    alias: string;
    type: string;
    code: string;
  };
}

const SUCCESSFUL_WASH_CODE = 0;

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
