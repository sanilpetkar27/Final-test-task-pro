## Recurring Reminder Function

This Edge Function sends reminder push notifications for recurring tasks and advances each task's `next_recurrence_notification_at`.

### Deploy

```bash
supabase functions deploy send-recurring-reminders
```

### Required secrets

```bash
supabase secrets set ONESIGNAL_API_KEY=your_onesignal_rest_api_key
supabase secrets set ONESIGNAL_APP_ID=your_onesignal_app_id
supabase secrets set RECURRING_CRON_SECRET=your_strong_random_secret
```

### Schedule it

Run this function from a scheduler every 15-60 minutes.

- URL: `https://<PROJECT_REF>.supabase.co/functions/v1/send-recurring-reminders`
- Method: `POST`
- Header: `Authorization: Bearer <RECURRING_CRON_SECRET>`
- Header: `Content-Type: application/json`
- Body: `{}`

The function itself decides whether a reminder is due based on `next_recurrence_notification_at` and `recurrence_frequency`.
