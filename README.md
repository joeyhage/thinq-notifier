# thinq-notifier

Every 15 minutes, check if the washing machine has finished since the last run, if it finished more than the threshold number of hours prior to the current time, if the dryer has not been started yet, and if the notification frequency has been met. If all conditions are met, send an email using AWS SNS.

Recently added: sending notifications when the washer has run more than 30 cycles without a tub clean cycle.

## Variables

- **`NOTIFICATION_THRESHOLD_HRS`:** The number of hours to wait after the washer cycle finished to send the first reminder email.
- **`NOTIFICATION_FREQ_HRS`:** After the first reminder email, how many hours to wait between subsequent reminder emails.
- **`MAX_NOTIFICATIONS`:**: The maximum number of notifications to send.

## Examples

The examples below assume:

- `NOTIFICATION_THRESHOLD_HRS=3`
- `NOTIFICATION_FREQ_HRS=3`
- `MAX_NOTIFICATIONS=2`

| Current time | Latest event time | Latest event type | Dryer running (Y/N) | First reminder time | Send email (Y/N) | Reason                                                                   |
| ------------ | ----------------- | ----------------- | ------------------- | ------------------- | ---------------- | ------------------------------------------------------------------------ |
| 12:00 PM     | 11:00 AM          | Washer            | N                   | -                   | N                | Hasn't been 3 s(NOTIFICATION_THRESHOLD_HRS) hours since washer finished  |
| 12:00 PM     | 8:55 AM           | Washer            | N                   | -                   | Y                | 3 (NOTIFICATION_THRESHOLD_HRS) hours have elapsed since washer finished  |
| 2:00 PM      | 8:55 AM           | Washer            | N                   | 12:00 PM            | N                | Hasn't been 3 (NOTIFICATION_FREQ_HRS) hours since the last notification  |
| 3:00 PM      | 8:55 AM           | Washer            | N                   | 12:00 PM            | Y                | 3 (NOTIFICATION_FREQ_HRS) hours have elapsed since the last notification |
| 6:00 PM      | 8:55 AM           | Washer            | N                   | 12:00 PM            | N                | 2 (MAX_NOTIFICATIONS) have already been sent                             |
| 12:00 PM     | 8:55 AM           | Washer            | Y                   | -                   | N                | Dryer is running                                                         |
| 3:00 PM      | 8:55 AM           | Washer            | Y                   | 12:00 PM            | N                | Dryer is running                                                         |
| 12:00 PM     | 8:55 AM           | Dryer             | N                   | -                   | N                | Latest event was the dryer                                               |
