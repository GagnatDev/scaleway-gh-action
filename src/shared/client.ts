import * as core from "@actions/core";
import type { ScalewayClientConfig, ScalewayRegion } from "./types";

const API_BASE = "https://api.scaleway.com";

/** Matches Scaleway standard error detail entries (see scaleway-sdk-go InvalidArgumentsError). */
interface ScalewayInvalidArgDetail {
  argument_name?: string;
  reason?: string;
  help_message?: string;
}

interface ScalewayPermissionDetail {
  resource?: string;
  action?: string;
}

interface ScalewayQuotaDetail {
  resource?: string;
  quota?: number;
  current?: number;
}

interface ScalewayErrorBody {
  message?: string;
  type?: string;
  resource?: string;
  resource_id?: string;
  details?: unknown[];
  fields?: Record<string, string[]>;
}

function formatInvalidArgumentDetails(details: ScalewayInvalidArgDetail[]): string {
  return details
    .map((d) => {
      const name = d.argument_name ?? "(unknown argument)";
      let part = name;
      switch (d.reason) {
        case "unknown":
          part += " is invalid for unexpected reason";
          break;
        case "required":
          part += " is required";
          break;
        case "format":
          part += " is wrongly formatted";
          break;
        case "constraint":
          part += " does not respect constraint";
          break;
        default:
          if (d.reason) part += ` (${d.reason})`;
      }
      if (d.help_message) part += `: ${d.help_message}`;
      return part;
    })
    .join("; ");
}

function formatPermissionDetails(details: ScalewayPermissionDetail[]): string {
  return details
    .map((d) => {
      const action = d.action ?? "?";
      const resource = d.resource ?? "?";
      return `${action} on ${resource}`;
    })
    .join("; ");
}

function formatQuotaDetails(details: ScalewayQuotaDetail[]): string {
  return details
    .map((d) => {
      const res = d.resource ?? "resource";
      return `${res} quota (${d.current ?? "?"}/${d.quota ?? "?"})`;
    })
    .join("; ");
}

/**
 * Build a log-friendly message from Scaleway JSON error bodies.
 * Many APIs return only a generic `message` (e.g. "invalid argument(s)") while
 * the actionable detail lives in `details`, `fields`, or `type`.
 */
export function formatScalewayErrorMessage(data: unknown, httpStatus: number): string {
  if (data === null || typeof data !== "object") {
    return `HTTP ${httpStatus}`;
  }

  const body = data as ScalewayErrorBody;
  const segments: string[] = [];

  if (body.message) segments.push(body.message);

  const t = body.type;

  if (t === "invalid_arguments" && Array.isArray(body.details)) {
    const parsed = body.details.filter(
      (x): x is ScalewayInvalidArgDetail =>
        x !== null && typeof x === "object" && "argument_name" in x,
    );
    if (parsed.length > 0) {
      segments.push(formatInvalidArgumentDetails(parsed));
    }
  } else if (t === "permissions_denied" && Array.isArray(body.details)) {
    const parsed = body.details.filter(
      (x): x is ScalewayPermissionDetail =>
        x !== null && typeof x === "object" && ("resource" in x || "action" in x),
    );
    if (parsed.length > 0) {
      segments.push(formatPermissionDetails(parsed));
    }
  } else if (t === "quotas_exceeded" && Array.isArray(body.details)) {
    const parsed = body.details.filter(
      (x): x is ScalewayQuotaDetail =>
        x !== null && typeof x === "object" && "resource" in x,
    );
    if (parsed.length > 0) {
      segments.push(formatQuotaDetails(parsed));
    }
  } else if (Array.isArray(body.details) && body.details.length > 0 && !t) {
    const parsed = body.details.filter(
      (x): x is ScalewayInvalidArgDetail =>
        x !== null && typeof x === "object" && "argument_name" in x,
    );
    if (parsed.length > 0) {
      segments.push(formatInvalidArgumentDetails(parsed));
    }
  }

  if (body.fields && Object.keys(body.fields).length > 0) {
    const fieldStr = Object.entries(body.fields)
      .map(([k, msgs]) => `${k}: ${msgs.join(", ")}`)
      .join("; ");
    segments.push(fieldStr);
  }

  if (body.resource && body.resource_id) {
    segments.push(`resource: ${body.resource} (${body.resource_id})`);
  }

  if (segments.length === 0) {
    try {
      return `HTTP ${httpStatus}: ${JSON.stringify(data)}`;
    } catch {
      return `HTTP ${httpStatus}`;
    }
  }

  const joined = segments.join(" — ");

  if (
    t === "invalid_arguments" &&
    Array.isArray(body.details) &&
    body.details.length === 0
  ) {
    return `${joined} — (no detail entries; raw: ${JSON.stringify(data)})`;
  }

  return joined;
}

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
          const detailMsg = formatScalewayErrorMessage(data, response.status);
          const msg = `[${opts.method} ${opts.path}] ${detailMsg}`;
          const err = new ScalewayApiError(msg, response.status, data, {
            method: opts.method,
            path: opts.path,
          });
          core.error(`Scaleway API error: ${detailMsg}`);
          try {
            core.debug(`[scaleway] Error response body: ${JSON.stringify(data)}`);
          } catch {
            /* ignore */
          }

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

export interface ScalewayFailedRequest {
  method: string;
  path: string;
}

export class ScalewayApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly response: unknown,
    public readonly request?: ScalewayFailedRequest,
  ) {
    super(message);
    this.name = "ScalewayApiError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
