import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import {
  GetParameterCommand,
  PutParameterCommand,
  SSMClient,
} from "@aws-sdk/client-ssm";
import axios from "axios";
import { DeviceType } from "homebridge-lg-thinq/dist/lib/constants";
import { Device } from "homebridge-lg-thinq/dist/lib/Device";
import { URL } from "url";
import { ThinQApi } from "./api";

export async function eventWasAWashCycle(
  eventMessage: EventMessage,
  api: ThinQApi,
  clientId: string
): Promise<boolean> {
  return (
    isWasherCycleFinished(eventMessage) &&
    !(await wasLatestWashTubClean(api, clientId, eventMessage))
  );
}

export function newestEventValid(events: Event[]) {
  return events.length && !!events[0].sendDate;
}

export async function initApi(
  username: string,
  password: string
): Promise<ThinQApi> {
  const api = new ThinQApi();
  api.setUsernamePassword(username, password);
  await api.ready();
  return api;
}

export async function getAppSecrets(region = "us-east-1"): Promise<AppSecrets> {
  const { Parameter } = await new SSMClient({ region }).send(
    new GetParameterCommand({
      Name: process.env.SECRET_NAME!,
      WithDecryption: true,
    })
  );
  return JSON.parse(Parameter?.Value || "{}");
}

export async function getThinQState(region = "us-east-1"): Promise<ThinQState> {
  const { Parameter } = await new SSMClient({ region }).send(
    new GetParameterCommand({
      Name: process.env.THINQ_STATE_STORE!,
      WithDecryption: false,
    })
  );
  return JSON.parse(Parameter?.Value || "{}");
}

export async function setThinQState(
  region = "us-east-1",
  newState: ThinQState
): Promise<void> {
  await new SSMClient({ region }).send(
    new PutParameterCommand({
      Name: process.env.THINQ_STATE_STORE!,
      Value: JSON.stringify(newState),
      Overwrite: true,
    })
  );
}

export async function getThinqApi(
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

export async function findLaundry(api: ThinQApi): Promise<LaundryDevices> {
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

export async function getRecentEvents(
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

export async function publishUnloadMessage(
  datetime: string,
  region?: string
): Promise<void> {
  await publishMessage(
    `Hello,\n\nThe washer finished at ${datetime}.\n\nDon't forget to unload the clothes!`,
    region
  );
}

export async function publishMessage(
  message: string,
  region = "us-east-1"
): Promise<void> {
  console.log(`Sending notification with message: ${message}`);
  await new SNSClient({ region }).send(
    new PublishCommand({
      Subject: "LG ThinQ Laundry Notification",
      Message: message,
      TopicArn: process.env.TOPIC_ARN,
    })
  );
}

export function isWasherCycleFinished(eventMessage: EventMessage): boolean {
  console.log(
    `Device type for event: ${eventMessage.extra.type}, event code: ${eventMessage.extra.code}, device name: ${eventMessage.extra.alias}`
  );
  return (
    eventMessage.extra.code?.startsWith(SUCCESSFUL_WASH_PREFIX) &&
    washerTypes.includes(Number(eventMessage.extra.type))
  );
}

export async function wasLatestWashTubClean(
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

export function isDryerOff(dryer?: Device): boolean {
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
    hoursSinceThreshold % notificationFreqHrs < 0.25 &&
    Math.floor(hoursSinceThreshold / notificationFreqHrs) < maxNotifications
  );
}

export async function triggerAnnouncement(webhookUrl?: string): Promise<void> {
  console.log(
    !!webhookUrl ? "Triggering webhook url" : "No webhook url to trigger"
  );
  if (!!webhookUrl) {
    await axios.get(webhookUrl);
  }
}

export function hasNotAlreadyNotifiedThisCycle(
  thinqState: ThinQState,
  newThinqState: ThinQState,
  cyclesSinceTubClean: number
) {
  return (
    (typeof thinqState.tclDue === "boolean" &&
      typeof thinqState.tclNotifiedAtCycle === "number" &&
      thinqState.tclDue !== newThinqState.tclDue) ||
    thinqState.tclNotifiedAtCycle !== cyclesSinceTubClean
  );
}

export function isRunning(snapshot: {state?: string}) {
  return typeof snapshot.state === 'string' && snapshot.state.toUpperCase() !== 'POWEROFF'
}

export const washerTypes = [
  DeviceType.WASHER,
  DeviceType.WASHER_NEW,
  DeviceType.WASH_TOWER,
];

export interface AppSecrets {
  username: string;
  password: string;
  clientId: string;
  webhookUrl: string;
}

export interface ThinQState {
  washCourse?: string;
  washerRunning?: boolean;
  washStartTime?: number;
  dryerStartTime?: number;
  washEndTime?: number;
  tclDue?: boolean;
  tclNotifiedAtCycle?: number;
}

export interface LaundryDevices {
  washer: Device;
  dryer: Device;
}

export interface Event {
  message: string;
  sendDate: string;
}

export interface EventMessage {
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

export const SUCCESSFUL_WASH_PREFIX = "0000";

export const NOT_RUNNING_STATUS = [
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
