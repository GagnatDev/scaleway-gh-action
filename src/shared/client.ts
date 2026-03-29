import * as core from "@actions/core";
import type { ScalewayClientConfig, ScalewayRegion } from "./types";

const API_BASE = "https://api.scaleway.com";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

export interface RequestOptions {
  method: "GET" | "POST" | "PATCH" | "DELETE" | "PUT";
  path: string;
  body?: unknown;
  /** Override the region for this request (useful for global APIs) */
  regionOverride?: string;
}

export class ScalewayClient {
  private secretKey: string;
  public region: ScalewayRegion;

  constructor(config: ScalewayClientConfig) {
    this.secretKey = config.secretKey;
    this.region = config.region;
  }

  /**
   * Build the full URL for a given API path.
   * Paths should include the product/version prefix, e.g.:
   *   /containers/v1beta1/regions/{region}/containers
   *
   * The literal `{region}` placeholder is replaced with the client's region.
   */
  buildUrl(path: string): string {
    const resolved = path.replace("{region}", this.region);
    return `${API_BASE}${resolved}`;
  }

  async request<T = unknown>(opts: RequestOptions): Promise<T> {
    const url = this.buildUrl(opts.path);
    const headers: Record<string, string> = {
      "X-Auth-Token": this.secretKey,
      "Content-Type": "application/json",
    };

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        core.debug(`[scaleway] ${opts.method} ${url} (attempt ${attempt})`);

        const response = await fetch(url, {
          method: opts.method,
          headers,
          body: opts.body ? JSON.stringify(opts.body) : undefined,
        });

        if (response.status === 204) {
          return {} as T;
        }

        const data = await response.json();

        if (!response.ok) {
          const msg =
            (data as { message?: string }).message ??
            `HTTP ${response.status}`;
          const err = new ScalewayApiError(msg, response.status, data);

          // Only retry on 429 or 5xx
          if (response.status === 429 || response.status >= 500) {
            lastError = err;
            if (attempt < MAX_RETRIES) {
              const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
              core.debug(`[scaleway] Retrying in ${delay}ms...`);
              await sleep(delay);
              continue;
            }
          }
          throw err;
        }

        return data as T;
      } catch (error) {
        if (error instanceof ScalewayApiError) throw error;
        lastError = error as Error;
        if (attempt < MAX_RETRIES) {
          const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
          await sleep(delay);
          continue;
        }
      }
    }

    throw lastError ?? new Error("Request failed after retries");
  }

  async get<T = unknown>(path: string): Promise<T> {
    return this.request<T>({ method: "GET", path });
  }

  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>({ method: "POST", path, body });
  }

  async patch<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>({ method: "PATCH", path, body });
  }

  async delete<T = unknown>(path: string): Promise<T> {
    return this.request<T>({ method: "DELETE", path });
  }
}

export class ScalewayApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly response: unknown,
  ) {
    super(message);
    this.name = "ScalewayApiError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
