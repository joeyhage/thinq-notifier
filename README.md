# thinq-notifier

At the top of every hour, check if the last event was the completion of a washing machine cycle, if the event occurred more than the threshold number of hours prior to the current time, if the dryer has not been started yet, and if the notification frequency has been met. If all conditions are met, send an email using AWS SNS.

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

## Current limitations

- A notification will not be sent if the washer and dryer are running at the same time and the washer finishes first. It will see the most recent event was from the dryer and not see that the washer finished right before that which would mean the washer is still full.
- If the latest event was the washer finishing a tub clean, it will still send a notification even though there are no clothes to dry.
