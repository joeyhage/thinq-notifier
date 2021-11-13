import { determineThresholdDatetime, getCurrentHour, isQuietHours } from "../lambda/datetime-util";

describe("determineThresholdDatetime", () => {
  test("should be `NOTIFICATION_THRESHOLD_HRS` after event date", async () => {
    // given
    process.env.NOTIFICATION_THRESHOLD_HRS = "3";
    const eventDate = new Date("2021-11-01T12:00:00.000Z");
  
    // when
    const result = determineThresholdDatetime(eventDate);
  
    // then
    expect(result).toEqual(new Date("2021-11-01T15:00:00.000Z"));
  });
});

describe("getCurrentHour", () => {
  test("should be 15 when time is 3 PM", async () => {
    // given
    process.env.TIMEZONE = "UTC"
    const eventDate = new Date("2021-11-01 3:00 PM Z");
  
    // when
    const result = getCurrentHour(eventDate);
  
    // then
    expect(result).toEqual(15);
  });
});

describe("isQuietHours", () => {
  test("should be quiet hours when time is 9 PM given `QUIET_HOUR_START`=21", async () => {
    // given
    process.env.TIMEZONE = "UTC";
    process.env.QUIET_HOUR_START = "21";
    process.env.QUIET_HOUR_END = "9";
  
    // when
    const result = isQuietHours(new Date("2021-11-01 9:00 PM Z"));
  
    // then
    expect(result).toBe(true);
  });

  test("should be quiet hours when time is 9 AM given `QUIET_HOUR_END`=9", async () => {
    // given
    process.env.TIMEZONE = "UTC";
    process.env.QUIET_HOUR_START = "21";
    process.env.QUIET_HOUR_END = "9";
  
    // when
    const result = isQuietHours(new Date("2021-11-01 9:00 AM Z"));
  
    // then
    expect(result).toBe(true);
  });

  test("should not be quiet hours when time is 8 AM given `QUIET_HOUR_START`=9 and `QUIET_HOUR_END`=11", async () => {
    // given
    process.env.TIMEZONE = "UTC";
    process.env.QUIET_HOUR_START = "9";
    process.env.QUIET_HOUR_END = "11";
  
    // when
    const result = isQuietHours(new Date("2021-11-01 8:00 AM Z"));
  
    // then
    expect(result).toBe(false);
  });
});