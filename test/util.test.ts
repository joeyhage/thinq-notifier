import { shouldSendRepeatNotification } from "../lambda/util";

describe("test shouldSendRepeatNotification given `NOTIFICATION_FREQ_HRS`=3 and `MAX_NOTIFICATIONS`=2", () => {

  beforeEach(() => {
    process.env.NOTIFICATION_FREQ_HRS = "3";
    process.env.MAX_NOTIFICATIONS = "2";
  });

  test("should send repeat notification given notification threshold was 3 hours ago", async () => {
    // given
    const thresholdTime = new Date();
    thresholdTime.setHours(thresholdTime.getHours() - 3);
    thresholdTime.setMinutes(thresholdTime.getMinutes() - 20);

    // when
    const result = shouldSendRepeatNotification(thresholdTime);

    // then
    expect(result).toBe(true);
  });

  test("should not repeat notification given notification threshold was 6 hours ago", async () => {
    // given
    const thresholdTime = new Date();
    thresholdTime.setHours(thresholdTime.getHours() - 6);
    thresholdTime.setMinutes(thresholdTime.getMinutes() - 20);

    // when
    const result = shouldSendRepeatNotification(thresholdTime);

    // then
    expect(result).toBe(false);
  });

  test("should not send repeat notification given notification threshold was 4 hours ago", async () => {
    // given
    const thresholdTime = new Date();
    thresholdTime.setHours(thresholdTime.getHours() - 4);
    thresholdTime.setMinutes(thresholdTime.getMinutes() - 20);

    // when
    const result = shouldSendRepeatNotification(thresholdTime);

    // then
    expect(result).toBe(false);
  });

  test("should not send repeat notification given notification threshold was 7 hours ago", async () => {
    // given
    const thresholdTime = new Date();
    thresholdTime.setHours(thresholdTime.getHours() - 7);
    thresholdTime.setMinutes(thresholdTime.getMinutes() - 20);

    // when
    const result = shouldSendRepeatNotification(thresholdTime);

    // then
    expect(result).toBe(false);
  });
});
