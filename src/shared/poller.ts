import * as core from "@actions/core";
import type { ScalewayClient } from "./client";
import type { PollOptions, PollResult } from "./types";

const DEFAULT_INTERVAL_MS = 5_000;

/**
 * Poll a Scaleway GET endpoint until a terminal status is reached.
 *
 * On each iteration the response JSON is inspected for `options.statusField`
 * (default: `"status"`). If the field is absent the status is treated as
 * `"unknown"` and polling continues. Once a success status is seen the result
 * is returned; once a failure status is seen an error is thrown immediately.
 * If `timeoutMs` elapses before any terminal status is reached an error is
 * also thrown.
 *
 * @param client  An authenticated ScalewayClient used for GET requests.
 * @param options Poll configuration — URL, status sets, timeout, and interval.
 * @returns       A PollResult containing the terminal status and the full
 *                response body typed as T.
 */
export async function pollStatus<T = unknown>(
  client: ScalewayClient,
  options: PollOptions,
): Promise<PollResult<T>> {
  const {
    url,
    statusField = "status",
    successStatuses,
    failureStatuses,
    timeoutMs,
    intervalMs = DEFAULT_INTERVAL_MS,
  } = options;

  const start = Date.now();

  while (true) {
    const elapsed = Date.now() - start;
    if (elapsed >= timeoutMs) {
      throw new Error(
        `Polling timed out after ${Math.round(elapsed / 1000)}s. ` +
          `Last poll to ${url} did not reach a terminal status.`,
      );
    }

    const data = await client.get<Record<string, unknown>>(url);
    const status = String(data[statusField] ?? "unknown");

    core.info(`Status: ${status} (${Math.round(elapsed / 1000)}s elapsed)`);

    if (successStatuses.has(status)) {
      return {
        success: true,
        status,
        data: data as T,
        elapsedMs: Date.now() - start,
      };
    }

    if (failureStatuses.has(status)) {
      const errorMsg =
        (data as { error_message?: string }).error_message ?? "Unknown error";
      throw new Error(
        `Resource entered failure status "${status}": ${errorMsg}`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
