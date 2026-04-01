import posthog from 'posthog-js'

posthog.init(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN!, {
  // Route via Next.js proxy rewrites — avoids adblocker interference
  api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? '/ingest',
  ui_host: 'https://us.posthog.com',
  // defaults: '2026-01-30' sets:
  //   - capture_pageview: 'history_change'  (automatic SPA pageviews — no manual tracking needed)
  //   - session_recording.strictMinimumDuration: true
  //   - internal_or_test_user_hostname: /localhost|127.0.0.1/
  defaults: '2026-01-30',
  // 'always' — CompoMate uses anonymous sessions (httpOnly cookie, no user auth),
  // so we profile every device to track cross-session engagement.
  person_profiles: 'always',
  capture_pageleave: true,
  // Session recording — mask form inputs to avoid capturing sensitive data
  session_recording: {
    maskAllInputs: true,
    maskInputOptions: { password: true },
    // strictMinimumDuration already set by defaults above
  },
})
