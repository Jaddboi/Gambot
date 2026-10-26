// Retries one API operation once after its reported rate-limit deadline, with a bounded wait.
const MAX_RETRY_WAIT_MS = 10_000;

async function retryRateLimitedRequest(request) {
  try {
    return await request();
  } catch (error) {
    if (error.status !== 429 || !Number.isFinite(error.retryAt)) throw error;
    const waitMs = Math.max(0, error.retryAt - Date.now());
    if (waitMs > MAX_RETRY_WAIT_MS) throw error;

    await new Promise((resolve) => setTimeout(resolve, waitMs));
    // A second rejection propagates; never loop or retry other failure types.
    return request();
  }
}

module.exports = { retryRateLimitedRequest };
