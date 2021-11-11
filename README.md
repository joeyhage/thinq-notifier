# thinq-notifier

At the top of every hour, check if the last event was the completion of a washing machine cycle, if the event occurred more than the threshold number of hours prior to the current time, if the dryer has not been started yet, and if the notification frequency has been met. If all conditions are met, send an email using AWS SNS.

## Variables

- **`NOTIFICATION_THRESHOLD_HRS`:** The number of hours to wait after the washer cycle finished to send the first reminder email.
- **`NOTIFICATION_FREQ_HRS`:** After the first reminder email, how many hours to wait between subsequent reminder emails.

## Examples

The examples below assume: 
- `NOTIFICATION_THRESHOLD_HRS=3`
- `NOTIFICATION_FREQ_HRS=3`

| Current time | Latest event time | Latest event type | Dryer running (Y/N) | First reminder time | Send email (Y/N) |
| ------------ | ----------------- | ----------------- | ------------------- | ------------------- | ---------------- |
| 12:00 PM     | 11:00 AM          | Washer            | N                   | -                   | N                |
| 12:00 PM     |  8:55 AM          | Washer            | N                   | -                   | Y                |
|  2:00 PM     |  8:55 AM          | Washer            | N                   | 12:00 PM            | N                |
|  3:00 PM     |  8:55 AM          | Washer            | N                   | 12:00 PM            | Y                |
|  3:00 PM     |  8:55 AM          | Washer            | N                   | 12:00 PM            | Y                |
| 12:00 PM     |  8:55 AM          | Washer            | Y                   | -                   | N                |
|  3:00 PM     |  8:55 AM          | Washer            | Y                   | 12:00 PM            | N                |
| 12:00 PM     |  8:55 AM          | Dryer             | N                   | -                   | N                |
