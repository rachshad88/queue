import { createHash, createHmac } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';
import { cache } from '../cache';
import { config } from '../config';
import { securityEvents } from '../db';
import { clientIp } from '../util';

const sec = config.security;
const sha1 = (value: string): string => createHash('sha1').update(value).digest('hex');
const hmac = (value: string): string => createHmac('sha256', config.sessionSecret).update(value).digest('hex');

// ---- IP allow / deny / temporary blocks ------------------------------------

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) {
    return null;
  }
  let out = 0;
  for (const part of parts) {
    const n = Number(part);
    if (!/^\d{1,3}$/.test(part) || n > 255) {
      return null;
    }
    out = out * 256 + n;
  }
  return out;
}

export function ipMatches(ip: string, entries: string[]): boolean {
  const target = ip.trim();
  if (target === '') {
    return false;
  }
  for (const raw of entries) {
    const entry = raw.trim();
    if (entry === '') {
      continue;
    }
    if (!entry.includes('/')) {
      if (entry.toLowerCase() === target.toLowerCase()) {
        return true;
      }
      continue;
    }
    const [subnet, bitsText] = entry.split('/', 2);
    const bits = Number(bitsText);
    const ipInt = ipv4ToInt(target);
    const subnetInt = ipv4ToInt(subnet);
    if (ipInt === null || subnetInt === null || !Number.isInteger(bits) || bits < 0 || bits > 32) {
      continue;
    }
    const size = 2 ** (32 - bits);
    if (Math.floor(ipInt / size) === Math.floor(subnetInt / size)) {
      return true;
    }
  }
  return false;
}

const blockKey = (ip: string): string => `security:block:${sha1(ip.trim())}`;
const offenseKey = (ip: string): string => `security:offenses:${sha1(ip.trim())}`;

export const ipBlocks = {
  isAllowed: (ip: string): boolean => ipMatches(ip, sec.allowlist),
  isDenied: (ip: string): boolean => ipMatches(ip, sec.denylist),
  isBlocked: (ip: string): boolean => cache.has(blockKey(ip)),
  remainingTtl: (ip: string): number => cache.ttl(blockKey(ip)),
  block(ip: string, seconds: number = sec.blockDurations[0], reason = ''): number {
    const duration = Math.max(60, seconds);
    cache.put(blockKey(ip), { reason, at: Date.now() }, duration);
    return duration;
  },
  /** Escalating block: each repeat offense inside the window lasts longer. */
  blockForOffense(ip: string, reason = ''): number {
    const count = cache.get<number>(offenseKey(ip), 0) + 1;
    cache.put(offenseKey(ip), count, sec.offenseWindow);
    const durations = sec.blockDurations;
    return this.block(ip, durations[Math.min(count, durations.length) - 1], reason);
  },
  unblock: (ip: string): void => cache.forget(blockKey(ip)),
};

// ---- Scoring ----------------------------------------------------------------

export function riskLevel(score: number): 'block' | 'challenge' | 'limit' | 'allow' {
  if (score >= sec.thresholds.block) {
    return 'block';
  }
  if (score >= sec.thresholds.challenge) {
    return 'challenge';
  }
  return score >= sec.thresholds.limit ? 'limit' : 'allow';
}

const firstMatch = (haystack: string, needles: string[]): string | null => needles.find((n) => n !== '' && haystack.includes(n)) ?? null;

export function assessRequest(req: Request): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const add = (key: string, reason: string): void => {
    score += sec.scores[key] ?? 0;
    reasons.push(reason);
  };

  const ua = String(req.get('user-agent') ?? '').trim();
  const lowerUa = ua.toLowerCase();
  if (firstMatch(lowerUa, sec.trustedBots) === null) {
    const malicious = firstMatch(lowerUa, sec.maliciousBots);
    const crawler = firstMatch(lowerUa, sec.aiCrawlers);
    const scraper = firstMatch(lowerUa, sec.scrapers);
    if (malicious) {
      add('known_malicious_bot', `known_malicious_bot:${malicious}`);
    } else if (crawler) {
      add('known_ai_crawler', `known_ai_crawler:${crawler}`);
    } else if (scraper) {
      add('known_scraper', `known_scraper:${scraper}`);
    }
  }
  if (ua === '') {
    add('empty_user_agent', 'empty_user_agent');
  }
  if (String(req.get('accept') ?? '').trim() === '') {
    add('missing_accept_header', 'missing_accept_header');
  }
  if (!sec.allowedMethods.includes(req.method.toUpperCase())) {
    add('invalid_method', `invalid_method:${req.method}`);
  }
  if (sec.suspiciousUrlPatterns.some((p) => p.test(req.path))) {
    add('suspicious_url', 'suspicious_url');
  }
  const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?') + 1) : '';
  if (query !== '') {
    let decoded = query;
    try {
      decoded = decodeURIComponent(query);
    } catch {
      // Malformed escapes are matched as sent.
    }
    if (sec.suspiciousQueryPatterns.some((p) => p.test(decoded))) {
      add('suspicious_url', 'suspicious_query');
    }
  }

  const fingerprint = sha1(clientIp(req));
  const hits = cache.increment(`security:hits:${fingerprint}:${Math.floor(Date.now() / 1000 / sec.rateWindow)}`, sec.rateWindow + 30);
  if (hits > sec.rateThreshold) {
    add('excessive_rate', `excessive_rate:${hits}`);
  }
  const notFounds = cache.get<number>(`security:404s:${fingerprint}`, 0);
  if (notFounds >= sec.repeat404Threshold) {
    add('repeated_404', `repeated_404:${notFounds}`);
  }
  const authFails = cache.get<number>(`security:authfails:${fingerprint}`, 0);
  if (authFails >= sec.authFailureThreshold) {
    add('repeated_auth_failure', `repeated_auth_failure:${authFails}`);
  }

  return { score: Math.min(999, score), reasons };
}

// ---- Event log ---------------------------------------------------------------

/** Record a security event. IP and user agent are stored only as keyed hashes. */
export function recordSecurityEvent(req: Request, eventType: string, score: number, reasons: string[], statusCode: number | null): void {
  const ip = clientIp(req);
  const ua = String(req.get('user-agent') ?? '').trim().slice(0, 200);
  const event = {
    ip_hash: hmac(ip),
    event_type: eventType.slice(0, 32),
    risk_score: Math.max(0, Math.min(999, score)),
    path: req.path.slice(0, 255),
    method: req.method.toUpperCase().slice(0, 10),
    user_agent_hash: ua === '' ? null : hmac(ua),
    reason: reasons.slice(0, 5).join(',').slice(0, 255) || null,
    status_code: statusCode,
    created_at: new Date(),
  };
  if (sec.logToDatabase) {
    securityEvents().insertOne(event).catch(() => undefined);
  }
  console.warn(`security.${event.event_type}`, JSON.stringify({ ip, user_id: req.session?.user_id ?? null, method: event.method, path: event.path, risk_score: event.risk_score, reasons, status: statusCode }));
}

function tooManyRequests(res: Response, retryAfter: number): void {
  res.set('Retry-After', String(Math.max(1, retryAfter)));
  res.status(429).json({ success: false, message: 'Too many requests. Please slow down and try again shortly.' });
}

// ---- Middleware --------------------------------------------------------------

/** Count 404s and auth failures per client so repeat probing raises the risk score. */
export const trackResponses: RequestHandler = (req, res, next) => {
  res.on('finish', () => {
    const fingerprint = sha1(clientIp(req));
    if (res.statusCode === 404) {
      cache.increment(`security:404s:${fingerprint}`, sec.repeat404Window);
    } else if ([401, 403, 419, 429].includes(res.statusCode)) {
      cache.increment(`security:authfails:${fingerprint}`, sec.authFailureWindow);
    }
  });
  next();
};

function limiterFor(req: Request): string {
  if (sec.pollingPaths.some((p) => req.path === p || req.path.startsWith(p.endsWith('/') ? p : `${p}/`))) {
    return 'polling';
  }
  if (req.method === 'GET' && String(req.query.q ?? '').trim() !== '') {
    return 'search';
  }
  return ['GET', 'HEAD'].includes(req.method) ? 'general' : 'json';
}

export const securityRateLimit: RequestHandler = (req, res, next) => {
  const ip = clientIp(req);
  if (!sec.rateLimitEnabled || ipBlocks.isAllowed(ip)) {
    next();
    return;
  }
  const limiter = limiterFor(req);
  const limits = sec.rateLimits[limiter] ?? sec.rateLimits.general;
  const key = `security-rl:${limiter}:${sha1(`${ip}|${req.session?.user_id ?? 0}`)}`;
  if (cache.increment(key, limits.decay) > limits.max) {
    recordSecurityEvent(req, 'rate_limited', 0, [`limiter:${limiter}`], 429);
    tooManyRequests(res, cache.ttl(key));
    return;
  }
  next();
};

/**
 * Automated-visitor pipeline. Monitor-first by default: requests are scored
 * and logged, and only blocked or slowed when SECURITY_ENFORCE is on.
 */
export const detectAutomatedVisitor: RequestHandler = (req, res, next) => {
  const ip = clientIp(req);
  if (!sec.detectionEnabled || ipBlocks.isAllowed(ip)) {
    next();
    return;
  }
  if (sec.enforce) {
    if (ipBlocks.isDenied(ip)) {
      recordSecurityEvent(req, 'denylist', 100, ['ip_denylist'], 403);
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }
    if (ipBlocks.isBlocked(ip)) {
      recordSecurityEvent(req, 'ip_block', 100, ['ip_block_active'], 403);
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }
  }

  const { score, reasons } = assessRequest(req);
  const level = riskLevel(score);
  if (score >= sec.logThreshold) {
    recordSecurityEvent(req, `risk_${level}`, score, reasons, null);
  }
  if (!sec.enforce || level === 'allow') {
    next();
    return;
  }
  if (level === 'block') {
    ipBlocks.blockForOffense(ip, reasons.slice(0, 3).join(','));
    recordSecurityEvent(req, 'bot_block', score, reasons, 403);
    res.status(403).json({ success: false, message: 'Forbidden' });
    return;
  }
  if (level === 'challenge') {
    // No interactive challenge provider is bundled, so this tier falls back.
    recordSecurityEvent(req, 'challenge_fallback', score, reasons, null);
    if (sec.challengeFallback === 'forbid') {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }
    tooManyRequests(res, 60);
    return;
  }
  recordSecurityEvent(req, 'rate_limited', score, reasons, 429);
  tooManyRequests(res, 60);
};
