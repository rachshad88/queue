try {
  process.loadEnvFile();
} catch {
  // No .env file: environment variables and the defaults below apply.
}

const int = (value: string | undefined, fallback: number): number => {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
};
const list = (value: string | undefined, fallback: string): string[] =>
  (value ?? fallback).split(',').map((s) => s.trim()).filter(Boolean);
const flag = (value: string | undefined, fallback: boolean): boolean =>
  value === undefined || value === '' ? fallback : ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());

const isTest = process.env.NODE_ENV === 'test';

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  isTest,
  port: int(process.env.PORT, 3000),
  bindAddress: process.env.BIND_ADDR ?? '0.0.0.0',
  mongoUrl: process.env.MONGO_URL ?? 'mongodb://127.0.0.1:27017/rhu_queue',
  sessionSecret: process.env.SESSION_SECRET ?? 'change-me-in-production',
  sessionLifetimeMin: int(process.env.SESSION_LIFETIME, 120),
  secureCookies: flag(process.env.SESSION_SECURE, false),
  /** Honor X-Forwarded-For when extracting the client IP (spoofable; off by default). */
  trustProxy: flag(process.env.TRUST_PROXY_HEADER, false),
  allowedOrigins: list(process.env.ALLOWED_ORIGINS, ''),
  /** Optional Redis for response caching, e.g. redis://127.0.0.1:6379/1. Empty = no cache. */
  redisUrl: isTest ? '' : (process.env.REDIS_URL ?? ''),

  // Department ids the queue rules key on (see seed script).
  admissionDeptId: int(process.env.ADMISSION_DEPT_ID, 3),
  waitingDeptId: int(process.env.WAITING_DEPT_ID, 15),
  /** Mutual help: CLINIC 1, 2 and 3 (ids 1, 2, 4). CLINIC 4 (id 12) is deliberately left out. */
  poolClinicIds: list(process.env.POOL_CLINIC_IDS, '1,2,4').map(Number),
  /** Display order for department lists; anything not listed sorts after, by name. */
  departmentOrder: [15, 3, 1, 2, 4, 12, 5, 6, 9, 7, 13, 14, 8],

  /** Idle expiry for non-exempt accounts; aligned with the stale-window sweep. */
  idleExpiryMin: 30,
  staleSectionMin: 30,
  onlineWindowMin: 15,
  defaultPassword: '12345',

  login: { maxAttempts: 5, lockMinutes: 15 },
  throttle: {
    enabled: flag(process.env.THROTTLE_ENABLED, !isTest),
    login: { max: 10, seconds: 60 },
    kiosk: { max: 30, seconds: 60 },
    passwordUpdate: { max: 3, seconds: 60 },
    backup: { max: 5, seconds: 60 },
  },

  backup: {
    directory: process.env.BACKUP_DIR ?? './storage/backups',
    /** Second folder that receives a copy of each verified nightly backup (empty = off). */
    copyDirectory: process.env.BACKUP_COPY_DIR ?? '',
    keep: int(process.env.BACKUP_KEEP, 7),
    schedule: 'Nightly at 02:00 (Manila)',
    warnHours: 26,
  },

  security: {
    detectionEnabled: flag(process.env.SECURITY_DETECTION_ENABLED, !isTest),
    /** false = monitor-first (score and log only); true = block / rate-limit. */
    enforce: flag(process.env.SECURITY_ENFORCE, false),
    rateLimitEnabled: flag(process.env.SECURITY_RATE_LIMIT_ENABLED, !isTest),
    thresholds: { block: 100, challenge: 60, limit: 30 },
    scores: {
      known_malicious_bot: 100,
      known_ai_crawler: 100,
      known_scraper: 80,
      empty_user_agent: 30,
      missing_accept_header: 20,
      excessive_rate: 40,
      repeated_404: 30,
      repeated_auth_failure: 50,
      suspicious_url: 50,
      invalid_method: 50,
    } as Record<string, number>,
    aiCrawlers: ['gptbot', 'chatgpt-user', 'oai-searchbot', 'claudebot', 'claude-web', 'anthropic-ai', 'google-extended', 'bytespider', 'ccbot', 'perplexitybot', 'amazonbot', 'applebot-extended', 'meta-externalagent', 'meta-externalfetcher', 'facebookexternalhit', 'tiktok-spider'],
    scrapers: ['scrapy', 'beautifulsoup', 'selenium', 'puppeteer', 'playwright', 'headlesschrome', 'phantomjs', 'curl', 'wget', 'python-requests', 'python-urllib', 'go-http-client', 'java/', 'libwww-perl', 'httpclient', 'okhttp', 'axios', 'masscan', 'nmap', 'nikto', 'sqlmap', 'acunetix', 'nessus', 'openvas', 'wpscan', 'dirbuster', 'gobuster', 'ffuf', 'hydra', 'medusa'],
    maliciousBots: ['zmeu', 'morfeus', 'dovecat', 'mirai'],
    trustedBots: ['googlebot', 'bingbot', 'slurp', 'duckduckbot', 'baiduspider', 'yandexbot', 'sogou', 'exabot', 'facebot', 'ia_archiver'],
    allowedMethods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    suspiciousUrlPatterns: [
      /\.(env|git|svn|bak|backup|old|sql|log|swp|dist|dump)$/i,
      /\/(wp-admin|wp-login|phpmyadmin|pma|administrator|xmlrpc)\b/i,
      /\/(vendor|storage|bootstrap\/cache|\.git|\.svn)\//i,
      /(composer|package)\.(json|lock)$/i,
      /(phpunit|vite\.config)\./i,
      /\.\.\//,
    ],
    suspiciousQueryPatterns: [/\.\.\//, /<\s*script/i, /union\s+select/i, /(sleep|benchmark)\s*\(/i, /(exec|system|passthru|shell_exec)\s*\(/i, /\$\{(jndi|env)/i],
    rateWindow: 60,
    rateThreshold: 240,
    repeat404Threshold: 5,
    repeat404Window: 3600,
    authFailureThreshold: 3,
    authFailureWindow: 3600,
    blockDurations: [300, 900, 3600, 86400],
    offenseWindow: 86400,
    allowlist: list(process.env.SECURITY_ALLOWLIST, '127.0.0.1/8,::1'),
    denylist: list(process.env.SECURITY_DENYLIST, ''),
    // Generous on purpose: a whole clinic shares one NAT address.
    rateLimits: {
      general: { max: 300, decay: 60 },
      polling: { max: 240, decay: 60 },
      json: { max: 120, decay: 60 },
      search: { max: 60, decay: 60 },
    } as Record<string, { max: number; decay: number }>,
    pollingPaths: ['/api/live-serving', '/api/display', '/api/session', '/api/session-check', '/api/queue', '/api/backup/status', '/sound/'],
    challengeFallback: (process.env.SECURITY_CHALLENGE_FALLBACK ?? 'rate_limit') as 'rate_limit' | 'forbid',
    logThreshold: int(process.env.SECURITY_LOG_THRESHOLD, 60),
    logToDatabase: flag(process.env.SECURITY_LOG_TO_DATABASE, true),
    /** Security log entries are deleted after this many days. */
    logRetentionDays: int(process.env.SECURITY_LOG_RETENTION_DAYS, 90),
    /** Health checks (monitoring, curl after a deploy) are never scored, logged or blocked. */
    healthPaths: ['/api/up'],
  },
};
