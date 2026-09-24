<?php

return [

    // Manila offset used for all "now" stamps (server TZ is UTC).
    'manila_now' => "CONVERT(datetime, SWITCHOFFSET(SYSDATETIMEOFFSET(), '+08:00'))",

    // Manila calendar day, used to scope live queue fetches to today's tickets.
    'manila_today' => "CAST(SWITCHOFFSET(SYSDATETIMEOFFSET(), '+08:00') AS DATE)",

    // Single-device login: a regular account is considered "active" until its
    // last_active marker is older than this many minutes (mirrors 1h idle logout).
    'single_login_ttl_min' => 60,

    // Idle expiry: non-exempt accounts whose last_active stamp is older than
    // this (heartbeat only stamps on real input) are marked expired by
    // session_check and cleanly logged out. Aligned with releaseStaleSections().
    'idle_expiry_min' => 30,

    'admission_dept_id' => 3,
    'waiting_dept_id' => 15,
    'pool_clinic_ids' => [1, 2, 4],

    // Honor X-Forwarded-For when extracting the client IP (spoofable; off by default).
    'trust_proxy_header' => env('TRUST_PROXY_HEADER', '0'),
];
