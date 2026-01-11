/**
 * Rate Limiting System
 */

export class RateLimiter {
  private requestsPerMinute: number;
  private burstLimit: number;
  private windowMs: number;
  private requests: number[];

  constructor(
    requestsPerMinute: number = 30,
    burstLimit: number = 10,
    windowMs: number = 60000
  ) {
    this.requestsPerMinute = requestsPerMinute;
    this.burstLimit = burstLimit;
    this.windowMs = windowMs;
    this.requests = [];
  }

  /**
   * Check if request can proceed
   */
  canMakeRequest(): boolean {
    const now = Date.now();

    // Remove old requests outside the window
    this.requests = this.requests.filter(
      timestamp => now - timestamp < this.windowMs
    );

    // Check burst limit
    if (this.requests.length >= this.burstLimit) {
      return false;
    }

    // Check rate limit
    const requestsInWindow = this.requests.filter(
      timestamp => now - timestamp < 60000 // 1 minute
    );

    if (requestsInWindow.length >= this.requestsPerMinute) {
      return false;
    }

    return true;
  }

  /**
   * Record a request
   */
  recordRequest(): void {
    this.requests.push(Date.now());
  }

  /**
   * Get time until next request is allowed
   */
  getTimeUntilNextRequest(): number {
    if (this.canMakeRequest()) {
      return 0;
    }

    const now = Date.now();
    
    if (this.requests.length === 0) {
      return 0;
    }

    const oldestRequest = Math.min(...this.requests);
    const timeSinceOldest = now - oldestRequest;

    // Time until burst limit clears
    const burstClearTime = this.windowMs - timeSinceOldest;

    // Time until rate limit clears (1 minute window)
    const recentRequests = this.requests.filter(
      timestamp => now - timestamp < 60000
    );
    
    if (recentRequests.length === 0) {
      return Math.max(0, burstClearTime);
    }

    const oldestRecent = Math.min(...recentRequests);
    const rateClearTime = 60000 - (now - oldestRecent);

    return Math.max(0, Math.min(burstClearTime, rateClearTime));
  }

  /**
   * Wait until next request is allowed
   */
  async waitForNextRequest(description: string = 'request'): Promise<void> {
    const waitTime = this.getTimeUntilNextRequest();
    if (waitTime > 0) {
      console.log(`Rate limit reached for ${description}, waiting ${Math.ceil(waitTime / 1000)}s...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  /**
   * Execute function with rate limiting
   */
  async executeWithRateLimit<T>(
    fn: () => Promise<T>,
    description: string = 'API call'
  ): Promise<T> {
    await this.waitForNextRequest(description);

    try {
      const result = await fn();
      this.recordRequest();
      return result;
    } catch (error) {
      // Still record the request even on failure
      this.recordRequest();
      throw error;
    }
  }
}

// Global rate limiter instance
export const globalRateLimiter = new RateLimiter();

