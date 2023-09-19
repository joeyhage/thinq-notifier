import {
  determineThresholdDatetime,
  formatDate,
  hasThresholdTimePassed,
  isQuietHours,
  minToMs,
} from "./datetime-util";
import * as util from "./util";

export const handler = async (): Promise<void> => {
  const region = process.env.AWS_REGION;
  try {
    const { username, password, webhookUrl } = await util.getAppSecrets(region);

    const api = await util.initApi(username, password);

    const { washer, dryer } = await util.findLaundry(api);

    const washerSnapshot = washer.data.snapshot?.washerDryer;
    const dryerSnapshot = dryer.data.snapshot?.washerDryer;
    if (
      typeof washer === "undefined" ||
      typeof dryer === "undefined" ||
      !washerSnapshot ||
      !dryerSnapshot
    ) {
      throw new Error("ThinQ API returned an unexpected response");
    }
    const cyclesSinceTubClean = Number(washerSnapshot.TCLCount || 0);

    const thinqState = await util.getThinQState(region);

    const now = new Date();

    const newThinqState = {
      ...thinqState,
      tclCount: cyclesSinceTubClean,
      tclDue: cyclesSinceTubClean > 30,
      washerRunning: util.isRunning(washerSnapshot),
      dryerRunning: util.isRunning(dryerSnapshot),
    };

    newThinqState.dryerRemainTimeMin = newThinqState.dryerRunning
      ? dryerSnapshot.remainTimeMinute
      : 0;

    if (util.newDryCycleStarted(newThinqState, thinqState)) {
      newThinqState.dryerStartTime =
        now.getTime() -
        minToMs(
          washerSnapshot.initialTimeMinute - dryerSnapshot.remainTimeMinute
        );
    }

    if (
      !newThinqState.washerRunning &&
      thinqState.washCourse?.toUpperCase() === "TUB_CLEAN"
    ) {
      console.info(
        "Not sending any notifications since most recent wash was a tub clean"
      );
    } else if (newThinqState.washerRunning) {
      const washTimeRemainingMins = washerSnapshot.remainTimeMinute;

      newThinqState.washEndTime =
        now.getTime() + minToMs(washTimeRemainingMins);

      if (
        typeof thinqState.tclCount === "number" &&
        thinqState.tclCount !== newThinqState.tclCount
      ) {
        newThinqState.washStartTime =
          newThinqState.washEndTime - minToMs(washerSnapshot.initialTimeMinute);
        newThinqState.washCourse = washerSnapshot.course;
      } else {
        console.info(
          "Not updating course or wash start time because it appears the same cycle is still running."
        );
      }
    } else if (thinqState.washEndTime && thinqState.dryerStartTime) {
      const { washEndDate, washEndDateStr } =
        determineWashEndDateStr(thinqState);

      const thresholdDatetime = determineThresholdDatetime(washEndDate);
      console.log(`Threshold datetime is ${formatDate(thresholdDatetime)}`);

      if (
        !util.wasWashUnloaded(thinqState, newThinqState) &&
        hasThresholdTimePassed(thresholdDatetime) &&
        util.shouldSendRepeatNotification(thresholdDatetime)
      ) {
        isQuietHours()
          ? await util.publishUnloadMessage(washEndDateStr, region)
          : await util.triggerAnnouncement(webhookUrl);
      } else {
        console.log(`Conditions to send notification were not met.`);
      }
    } else {
      console.log("Not enough information is available to determine state.");
    }

    await maybeSendWashFinishedNotification(thinqState, newThinqState, region);

    await maybeSendTclNotification(
      newThinqState,
      cyclesSinceTubClean,
      thinqState,
      region
    );

    console.log({ thinqState, newThinqState });
    await util.setThinQState(region, newThinqState);
  } catch (e: any) {
    console.error(`Uncaught exception`, e);
    await util.publishMessage(
      e.message || "Uncaught exception. Check logs.",
      region
    );
  }
};

async function maybeSendWashFinishedNotification(
  thinqState: util.ThinQState,
  newThinqState: util.ThinQState,
  region: string | undefined
) {
  if (
    washJustFinished(thinqState, newThinqState) &&
    !util.wasWashUnloaded(thinqState, newThinqState)
  ) {
    const { washEndDateStr } = determineWashEndDateStr(thinqState);
    await util.publishUnloadMessage(washEndDateStr, region);
  }
}

async function maybeSendTclNotification(
  newThinqState: util.ThinQState,
  cyclesSinceTubClean: number,
  thinqState: util.ThinQState,
  region: string | undefined
) {
  if (
    newThinqState.tclDue &&
    cyclesSinceTubClean % 3 === 0 &&
    util.hasNotAlreadyNotifiedThisCycle(
      thinqState,
      newThinqState,
      cyclesSinceTubClean
    )
  ) {
    newThinqState.tclNotifiedAtCycle = cyclesSinceTubClean;
    await util.publishMessage(
      `Hello,\n\n${cyclesSinceTubClean} washer cycles have run since the last tub clean. Please clean the washing machine.`,
      region
    );
  }
}

function washJustFinished(
  thinqState: util.ThinQState,
  newThinqState: util.ThinQState
) {
  return thinqState.washerRunning && !newThinqState.washerRunning;
}

function determineWashEndDateStr(thinqState: util.ThinQState): {
  washEndDate: Date;
  washEndDateStr: string;
} {
  const washEndDate = new Date(thinqState.washEndTime!);
  const washEndDateStr = formatDate(washEndDate);
  const dryerStartDateStr = formatDate(new Date(thinqState.dryerStartTime!));
  console.log(
    `Most recent wash cycle finished at ${washEndDateStr}, wash type: ${thinqState.washCourse}`
  );
  console.log(`Most recent dry cycle started at ${dryerStartDateStr}`);
  return { washEndDate, washEndDateStr };
}
