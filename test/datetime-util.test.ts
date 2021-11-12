import { determineThresholdDatetime } from "../lambda/datetime-util";

describe("determineThresholdDatetime", () => {
  test("should return `NOTIFICATION_THRESHOLD_HRS` after event date", async () => {
    // given
    process.env.NOTIFICATION_THRESHOLD_HRS = "3";
    const eventDate = new Date("2021-11-01T12:00:00.000Z");
  
    // when
    const result = determineThresholdDatetime(eventDate);
  
    // then
    expect(result).toEqual(new Date("2021-11-01T15:00:00.000Z"));
  });
});
