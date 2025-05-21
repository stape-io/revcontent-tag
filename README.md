# RevContent Tag for Google Tag Manager Server-Side

The **RevContent Tag for GTM Server-Side** enables server-to-server (S2S) conversion tracking by sending postback conversion data directly to RevContent’s API. It supports tracking two types of events: **Page View** and **Conversion**.

## How to Use

1. Add the **RevContent Tag** to your Server GTM container.
2. Select the **Event Type**:
   - **Page View** — Stores the Click ID from the URL parameter (default is `rc_uuid`) into a cookie.
   - **Conversion** — Sends a postback conversion request to RevContent with conversion data.
3. For **Page View** events:
   - Configure the URL parameter name for the Click ID if different from the default `rc_uuid`.
   - Optionally set cookie expiration (days), domain, and HttpOnly flag.
4. For **Conversion** events:
   - Provide your **API Key** from your RevContent account.
   - Specify the **rc_uuid Click ID** value (optional; if omitted, the tag reads from the cookie).
   - Enter the **Amount** of the conversion (must be a positive integer).
   - Optionally override the **User IP Address** and **User Agent**.
   - Enable **Use Optimistic Scenario** to speed up tag execution by firing success immediately without waiting for API response.
5. Configure **Consent Settings** to control whether data is sent always or only if marketing consent is given.
6. Optionally enable **Logging**:
   - Console logs during preview/debug or always.
   - BigQuery logs for storing event data in your Google Cloud project.

## Required Fields

- For **Page View**:
  - **Click ID URL Parameter Name** (default: `rc_uuid`)
- For **Conversion**:
  - **API Key** — your RevContent API access key.
  - **rc_uuid (Click ID)** — must be provided or available in the cookie.
  - **Amount** — the value of the conversion (non-zero positive integer).

## Important Notes

**WARNING:** This tracking method should **not** be used together with RevContent conversion pixels on your site. Using both simultaneously will cause duplicate conversions to be reported. Use one or the other.

For **mobile app conversions**, the Click ID (`rc_uuid`) must be stored and retrieved using alternative methods such as:
  - The [Stape Store Writer tag](https://stape.io/helpdesk/documentation/stape-store-feature#how-to-use-the-stape-store-writer-tag) and [Stape Store Lookup variable](https://stape.io/helpdesk/documentation/stape-store-feature#stape-store-lookup-variable)
  - The [Firestore Writer tag](https://stape.io/blog/write-data-to-firestore-from-server-google-tag-manager) and [Firestore Restore variable](https://stape.io/solutions/firestore-restore-variable)

  These approaches help persist and access the Click ID for app environments where URL parameters and cookies are not available.

## Benefits of Using Server-Side Tracking with RevContent

- ✅ **Reliable Conversion Tracking** — Server-to-server calls bypass client-side blockers and limitations.
- 🔒 **Improved Data Privacy** — Allows you to redact or override user IP and user agent.
- ⚡ **Faster Response Times** — The Optimistic Scenario option allows faster tag execution by skipping API wait.

## Open Source

The **RevContent Tag for GTM Server-Side** is developed and maintained by the [Stape Team](https://stape.io/) under the Apache 2.0 license.
