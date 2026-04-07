/**
 * Shared TypeScript interfaces for Scaleway API resources.
 *
 * Each interface maps to a resource returned or accepted by a Scaleway API endpoint.
 * See https://www.scaleway.com/en/developers/api/ for authoritative field documentation.
 */

/** The three Scaleway regions supported by these actions. */
export type ScalewayRegion = "fr-par" | "nl-ams" | "pl-waw";

export interface ScalewayClientConfig {
  secretKey: string;
  region: ScalewayRegion;
}

export interface ScalewayErrorResponse {
  message: string;
  type: string;
  fields?: Record<string, string[]>;
}

export interface PollOptions {
  /** URL to poll via GET */
  url: string;
  /** Field in the JSON response that holds the status string. Defaults to "status". */
  statusField?: string;
  /** Set of status values that mean "done successfully" */
  successStatuses: Set<string>;
  /** Set of status values that mean "failed terminally" */
  failureStatuses: Set<string>;
  /** Maximum time to wait in milliseconds */
  timeoutMs: number;
  /** Interval between polls in milliseconds */
  intervalMs?: number;
}

export interface PollResult<T = unknown> {
  success: boolean;
  status: string;
  data: T;
  elapsedMs: number;
}

// --- Container Registry types ---

/** A Scaleway Container Registry namespace that hosts Docker images. */
export interface RegistryNamespace {
  id: string;
  name: string;
  endpoint: string;
  status: string;
  is_public: boolean;
  image_count: number;
  region: string;
}

// --- Serverless Containers types ---

/**
 * Lifecycle status of a Serverless Container.
 * Terminal statuses: "ready" (success), "error" (failure), "locked" (failure).
 */
export type ContainerStatus =
  | "unknown"
  | "ready"       // terminal success
  | "deleting"
  | "error"       // terminal failure
  | "locked"      // terminal failure
  | "creating"
  | "pending"
  | "created";

export type ContainerPrivacy = "unknown_privacy" | "public" | "private";
export type ContainerProtocol = "unknown_protocol" | "http1" | "h2c";
export type ContainerHttpOption = "unknown_http_option" | "enabled" | "redirected";

/** A secret environment variable reference stored in the container config. */
export interface SecretEnvVar {
  key: string;
  /** Present when the value is fetched with permissions; absent in list responses. */
  value?: string;
}

/** A Scaleway Serverless Container resource. */
export interface Container {
  id: string;
  name: string;
  namespace_id: string;
  status: ContainerStatus;
  environment_variables: Record<string, string>;
  min_scale: number;
  max_scale: number;
  memory_limit: number;
  cpu_limit: number;
  timeout: string;
  error_message: string | null;
  privacy: ContainerPrivacy;
  description: string;
  registry_image: string;
  max_concurrency: number;
  domain_name: string;
  protocol: ContainerProtocol;
  port: number;
  secret_environment_variables: SecretEnvVar[];
  http_option: ContainerHttpOption;
  region: string;
}

/** A Scaleway Serverless Container namespace (groups containers). */
export interface ContainerNamespace {
  id: string;
  name: string;
  status: string;
  registry_namespace_id: string;
  registry_endpoint: string;
  environment_variables: Record<string, string>;
  project_id: string;
  region: string;
}

/** A custom domain mapping attached to a Serverless Container. */
export interface ContainerDomain {
  id: string;
  hostname: string;
  container_id: string;
  /** Public HTTPS URL once DNS and TLS are provisioned. */
  url: string;
  status: string;
  error_message: string | null;
}

// --- Serverless Jobs types ---

/**
 * Lifecycle status of a Serverless Job run.
 * Terminal statuses: "succeeded" (success), "failed" / "canceled" / "internal_error" (failure).
 */
export type JobRunStatus =
  | "unknown_status"
  | "queued"
  | "scheduled"
  | "running"
  | "succeeded"       // terminal success
  | "failed"          // terminal failure
  | "canceled"        // terminal failure
  | "internal_error"; // terminal failure

/** The definition of a Serverless Job (template). */
export interface JobDefinition {
  id: string;
  name: string;
  cpu_limit: number;
  memory_limit: number;
  image_uri: string;
  command: string;
  description: string;
  region: string;
}

/** A single execution instance of a JobDefinition. */
export interface JobRun {
  id: string;
  job_definition_id: string;
  status: JobRunStatus;
  created_at: string;
  updated_at: string;
  terminated_at: string | null;
  exit_code: number | null;
  run_duration: string | null;
  error_message: string;
  region: string;
}

// --- Secret Manager types ---

/** A named secret in Scaleway Secret Manager (holds versioned values). */
export interface Secret {
  id: string;
  project_id: string;
  name: string;
  status: string;
  created_at: string;
  updated_at: string;
  description: string;
  version_count: number;
  region: string;
}

/** A single version of a Secret (immutable once created). */
export interface SecretVersion {
  revision: number;
  secret_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  description: string;
}

/** Response from accessing (reading) a SecretVersion value. */
export interface SecretVersionAccess {
  secret_id: string;
  revision: number;
  /** Base64-encoded secret value. */
  data: string;
}

// --- DNS types ---

/** A single DNS record in a Scaleway DNS zone. */
export interface DnsRecord {
  id: string;
  name: string;
  type: string;
  data: string;
  ttl: number;
  priority?: number;
  comment?: string;
}

/** A Scaleway DNS zone. */
export interface DnsZone {
  domain: string;
  subdomain: string;
  ns: string[];
  status: string;
}
