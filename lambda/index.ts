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
      tclDue: cyclesSinceTubClean > 30,
      washerRunning: util.isRunning(washerSnapshot),
    };

    const dryerRunning = util.isRunning(dryerSnapshot)
    if (dryerRunning) {
      newThinqState.dryerStartTime = now.getTime() - minToMs(washerSnapshot.initialTimeMinute - dryerSnapshot.remainTimeMinute);
    }

    if (newThinqState.washerRunning) {
      const washTimeRemainingMins = washerSnapshot.remainTimeMinute;

      newThinqState.washEndTime =
        now.getTime() + minToMs(washTimeRemainingMins);
      newThinqState.washStartTime =
        newThinqState.washEndTime - minToMs(washerSnapshot.initialTimeMinute);
      newThinqState.washCourse = washerSnapshot.course;
    } else if (thinqState.washCourse?.toUpperCase() === "TUB_CLEAN") {
      console.info(
        "Not sending any notifications since most recent wash was a tub clean"
      );
      return;
    } else if (thinqState.washEndTime && thinqState.dryerStartTime) {
      const washEndDate = new Date(thinqState.washEndTime);
      const formattedEndDate = formatDate(washEndDate);
      console.log(`Most recent wash was at ${formattedEndDate}`);

      const thresholdDatetime = determineThresholdDatetime(washEndDate);
      console.log(`Threshold datetime is ${formatDate(thresholdDatetime)}`);

      if (
        !dryerRunning &&
        thinqState.dryerStartTime < thinqState.washEndTime &&
        hasThresholdTimePassed(thresholdDatetime) &&
        util.shouldSendRepeatNotification(thresholdDatetime)
      ) {
        isQuietHours()
          ? await util.publishUnloadMessage(formattedEndDate, region)
          : await util.triggerAnnouncement(webhookUrl);
      }
    }

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
