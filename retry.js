export async function withRetry(operation, maxRetries = 3) {
  let retryCount = 0;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (error.response?.statusCode === 429) {
        // Get retry after value from headers, default to 1 second if not present
        const retryAfter =
          (parseInt(error.response.headers["retry-after"], 10) || 30) + 1;

        if (retryCount >= maxRetries) {
          throw new Error(
            `Failed after ${maxRetries} retries: ${error.message}`
          );
        }

        // Wait for the specified duration
        await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
        retryCount++;
        continue;
      }

      // If it's not a 429 error, throw it immediately
      throw error;
    }
  }
}
