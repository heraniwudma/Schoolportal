import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

interface RateLimitRecord {
  timestamps: number[];
}

interface FailureRecord {
  failureCount: number;
  lockedUntil: number;
  firstFailureAt: number;
}

@Injectable()
export class AuthRateLimiterService implements OnModuleDestroy {
  private readonly logger = new Logger(AuthRateLimiterService.name);

  // Forgot password request limits: max 5 requests per 15 minutes per IP and per Login ID
  private readonly FORGOT_MAX_ATTEMPTS = 5;
  private readonly FORGOT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

  // OTP verification attempts: max 5 failed attempts per 15 minutes before burning OTP and lockout
  private readonly OTP_MAX_FAILURES = 5;
  private readonly OTP_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

  private readonly forgotIpMap = new Map<string, RateLimitRecord>();
  private readonly forgotLoginIdMap = new Map<string, RateLimitRecord>();
  private readonly otpVerifyFailureMap = new Map<string, FailureRecord>();

  private readonly cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => this.pruneExpired(), 5 * 60 * 1000);
    // Unref so it doesn't block node process exit in tests
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  onModuleDestroy() {
    clearInterval(this.cleanupInterval);
  }

  // ── Forgot Password Request Rate Limiting ──────────────────────────────────

  checkForgotRateLimit(ip: string, loginId: string): { allowed: boolean; retryAfterSeconds: number } {
    const now = Date.now();
    const cleanIp = (ip || 'unknown').trim();
    const cleanLoginId = (loginId || 'unknown').trim().toLowerCase();

    // Check IP rate limit
    const ipRecord = this.forgotIpMap.get(cleanIp);
    if (ipRecord) {
      const recentTimestamps = ipRecord.timestamps.filter((t) => now - t < this.FORGOT_WINDOW_MS);
      if (recentTimestamps.length >= this.FORGOT_MAX_ATTEMPTS) {
        const oldest = recentTimestamps[0];
        const retryAfterSeconds = Math.ceil((oldest + this.FORGOT_WINDOW_MS - now) / 1000);
        return { allowed: false, retryAfterSeconds: Math.max(retryAfterSeconds, 1) };
      }
    }

    // Check Login ID rate limit
    const loginIdRecord = this.forgotLoginIdMap.get(cleanLoginId);
    if (loginIdRecord) {
      const recentTimestamps = loginIdRecord.timestamps.filter((t) => now - t < this.FORGOT_WINDOW_MS);
      if (recentTimestamps.length >= this.FORGOT_MAX_ATTEMPTS) {
        const oldest = recentTimestamps[0];
        const retryAfterSeconds = Math.ceil((oldest + this.FORGOT_WINDOW_MS - now) / 1000);
        return { allowed: false, retryAfterSeconds: Math.max(retryAfterSeconds, 1) };
      }
    }

    return { allowed: true, retryAfterSeconds: 0 };
  }

  recordForgotAttempt(ip: string, loginId: string): void {
    const now = Date.now();
    const cleanIp = (ip || 'unknown').trim();
    const cleanLoginId = (loginId || 'unknown').trim().toLowerCase();

    // Record for IP
    const ipRecord = this.forgotIpMap.get(cleanIp) || { timestamps: [] };
    ipRecord.timestamps = ipRecord.timestamps.filter((t) => now - t < this.FORGOT_WINDOW_MS);
    ipRecord.timestamps.push(now);
    this.forgotIpMap.set(cleanIp, ipRecord);

    // Record for Login ID
    const loginIdRecord = this.forgotLoginIdMap.get(cleanLoginId) || { timestamps: [] };
    loginIdRecord.timestamps = loginIdRecord.timestamps.filter((t) => now - t < this.FORGOT_WINDOW_MS);
    loginIdRecord.timestamps.push(now);
    this.forgotLoginIdMap.set(cleanLoginId, loginIdRecord);
  }

  // ── OTP Verification Rate Limiting & Brute-Force Guard ──────────────────────

  checkOtpVerifyRateLimit(key: string): { allowed: boolean; remainingAttempts: number; retryAfterSeconds: number } {
    const now = Date.now();
    const cleanKey = (key || 'unknown').trim().toLowerCase();
    const record = this.otpVerifyFailureMap.get(cleanKey);

    if (!record) {
      return { allowed: true, remainingAttempts: this.OTP_MAX_FAILURES, retryAfterSeconds: 0 };
    }

    // If locked out
    if (record.lockedUntil > now) {
      const retryAfterSeconds = Math.ceil((record.lockedUntil - now) / 1000);
      return { allowed: false, remainingAttempts: 0, retryAfterSeconds: Math.max(retryAfterSeconds, 1) };
    }

    // If window expired, reset
    if (now - record.firstFailureAt > this.OTP_LOCKOUT_MS) {
      this.otpVerifyFailureMap.delete(cleanKey);
      return { allowed: true, remainingAttempts: this.OTP_MAX_FAILURES, retryAfterSeconds: 0 };
    }

    const remaining = Math.max(this.OTP_MAX_FAILURES - record.failureCount, 0);
    return { allowed: remaining > 0, remainingAttempts: remaining, retryAfterSeconds: 0 };
  }

  recordOtpVerifyFailure(key: string): { locked: boolean; remainingAttempts: number } {
    const now = Date.now();
    const cleanKey = (key || 'unknown').trim().toLowerCase();
    let record = this.otpVerifyFailureMap.get(cleanKey);

    if (!record || now - record.firstFailureAt > this.OTP_LOCKOUT_MS) {
      record = {
        failureCount: 1,
        lockedUntil: 0,
        firstFailureAt: now,
      };
    } else {
      record.failureCount += 1;
    }

    let locked = false;
    if (record.failureCount >= this.OTP_MAX_FAILURES) {
      record.lockedUntil = now + this.OTP_LOCKOUT_MS;
      locked = true;
      this.logger.warn(`[OTP LOCKOUT] Key "${cleanKey}" exceeded maximum verification attempts. Locked for 15 minutes.`);
    }

    this.otpVerifyFailureMap.set(cleanKey, record);
    const remainingAttempts = Math.max(this.OTP_MAX_FAILURES - record.failureCount, 0);

    return { locked, remainingAttempts };
  }

  clearOtpVerifyFailures(key: string): void {
    const cleanKey = (key || 'unknown').trim().toLowerCase();
    this.otpVerifyFailureMap.delete(cleanKey);
  }

  // ── Prune Expired Entries ──────────────────────────────────────────────────

  private pruneExpired(): void {
    const now = Date.now();

    for (const [key, record] of this.forgotIpMap.entries()) {
      record.timestamps = record.timestamps.filter((t) => now - t < this.FORGOT_WINDOW_MS);
      if (record.timestamps.length === 0) {
        this.forgotIpMap.delete(key);
      }
    }

    for (const [key, record] of this.forgotLoginIdMap.entries()) {
      record.timestamps = record.timestamps.filter((t) => now - t < this.FORGOT_WINDOW_MS);
      if (record.timestamps.length === 0) {
        this.forgotLoginIdMap.delete(key);
      }
    }

    for (const [key, record] of this.otpVerifyFailureMap.entries()) {
      if (record.lockedUntil <= now && now - record.firstFailureAt > this.OTP_LOCKOUT_MS) {
        this.otpVerifyFailureMap.delete(key);
      }
    }
  }
}
