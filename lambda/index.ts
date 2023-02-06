import { SNS, SSM } from "aws-sdk";
import axios from "axios";
import { DeviceType } from "homebridge-lg-thinq/dist/lib/constants";
import { Device } from "homebridge-lg-thinq/dist/lib/Device";
import { URL } from "url";
import { ThinQApi } from "./api";
import {
  determineThresholdDatetime,
  formatDate,
  hasThresholdTimePassed,
  isQuietHours,
  wasOneHourOrLessAgo,
} from "./datetime-util";

interface LaundryDevices {
  washer: Device;
  dryer: Device;
}

export const handler = async (): Promise<void> => {
  const region = process.env.AWS_REGION;
  try {
    const { username, password, clientId, webhookUrl } = await getAppSecrets(
      region
    );

    const api = await initApi(username, password);

    const { washer, dryer } = await findLaundry(api);
    const events = await getRecentEvents(api, clientId);

    const cyclesSinceTubClean = Number(
      washer.snapshot?.washerDryer?.TCLCount || 0
    );

    if (typeof dryer === "undefined" || !events.length || !events[0].sendDate) {
      throw new Error("ThinQ API returned an unexpected response");
    }

    const mostRecentEvent = events[0];
    const eventMessage = JSON.parse(mostRecentEvent.message) as EventMessage;
    const eventDate = new Date(Number(mostRecentEvent.sendDate) * 1000);
    const formattedEventDate = formatDate(eventDate);

    if (!(await eventWasAWashCycle(eventMessage, api, clientId))) {
      console.info("Skipping event since it was not a wash cycle");
      return;
    }

    const thresholdDatetime = determineThresholdDatetime(eventDate);
    console.log(`Most recent event was at ${formattedEventDate}`);
    console.log(`Threshold datetime is ${formatDate(thresholdDatetime)}`);

    if (
      wasOneHourOrLessAgo(eventDate) &&
      cyclesSinceTubClean > 30 &&
      cyclesSinceTubClean % 3 === 0
    ) {
      await publishMessage(
        `Hello,\n\n${cyclesSinceTubClean} washer cycles have run since the last tub clean. Please clean the washing machine.`,
        region
      );
    }

    if (
      isDryerOff(dryer) &&
      hasThresholdTimePassed(thresholdDatetime) &&
      shouldSendRepeatNotification(thresholdDatetime)
    ) {
      isQuietHours()
        ? await publishUnloadMessage(formattedEventDate, region)
        : await triggerAnnouncement(webhookUrl);
    }
  } catch (e: any) {
    console.error(`Uncaught exception`, e);
    await publishMessage(
      e.message || "Uncaught exception. Check logs.",
      region
    );
  }
};

async function eventWasAWashCycle(
  eventMessage: EventMessage,
  api: ThinQApi,
  clientId: string
): Promise<boolean> {
  return (
    isWasherCycleFinished(eventMessage) &&
    !(await wasLatestWashTubClean(api, clientId, eventMessage))
  );
}

function newestEventValid(events: Event[]) {
  return events.length && !!events[0].sendDate;
}

async function initApi(username: string, password: string): Promise<ThinQApi> {
  const api = new ThinQApi();
  api.setUsernamePassword(username, password);
  await api.ready();
  return api;
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

async function findLaundry(api: ThinQApi): Promise<LaundryDevices> {
  return (await api.getListDevices())
    .map((device) => new Device(device))
    .reduce((accum, device) => {
      const deviceType = Number(device.data.deviceType);
      if (washerTypes.includes(deviceType)) {
        accum.washer = device;
      } else if (deviceType === DeviceType.DRYER) {
        accum.dryer = device;
      }
      return accum;
    }, {} as LaundryDevices);
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
      Subject: "LG ThinQ Laundry Notification",
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
    eventMessage.extra.code?.startsWith(SUCCESSFUL_WASH_PREFIX) &&
    washerTypes.includes(Number(eventMessage.extra.type))
  );
}

const washerTypes = [
  DeviceType.WASHER,
  DeviceType.WASHER_NEW,
  DeviceType.WASH_TOWER,
];

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

export function shouldSendRepeatNotification(thresholdDatetime: Date): boolean {
  const notificationFreqHrs = Number(process.env.NOTIFICATION_FREQ_HRS);
  const maxNotifications = Number(process.env.MAX_NOTIFICATIONS);

  const msSinceThreshold = Date.now() - thresholdDatetime.getTime();
  const hoursSinceThreshold = msSinceThreshold / (60 * 60 * 1000);

  console.log({ hoursSinceThreshold, notificationFreqHrs, maxNotifications });
  return (
    hoursSinceThreshold % notificationFreqHrs < 1 &&
    Math.floor(hoursSinceThreshold / notificationFreqHrs) < maxNotifications
  );
}

async function triggerAnnouncement(webhookUrl?: string): Promise<void> {
  console.log(
    !!webhookUrl ? "Triggering webhook url" : "No webhook url to trigger"
  );
  if (!!webhookUrl) {
    await axios.get(webhookUrl);
  }
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

const SUCCESSFUL_WASH_PREFIX = "0000";

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
