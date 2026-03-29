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
  /** Field in the JSON response that holds the status string */
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

export type ContainerStatus =
  | "unknown"
  | "ready"
  | "deleting"
  | "error"
  | "locked"
  | "creating"
  | "pending"
  | "created";

export type ContainerPrivacy = "unknown_privacy" | "public" | "private";
export type ContainerProtocol = "unknown_protocol" | "http1" | "h2c";
export type ContainerHttpOption = "unknown_http_option" | "enabled" | "redirected";

export interface SecretEnvVar {
  key: string;
  value?: string;
}

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

export interface ContainerDomain {
  id: string;
  hostname: string;
  container_id: string;
  url: string;
  status: string;
  error_message: string | null;
}

// --- Serverless Jobs types ---

export type JobRunStatus =
  | "unknown_status"
  | "queued"
  | "scheduled"
  | "running"
  | "succeeded"
  | "failed"
  | "canceled"
  | "internal_error";

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

export interface SecretVersion {
  revision: number;
  secret_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  description: string;
}

export interface SecretVersionAccess {
  secret_id: string;
  revision: number;
  data: string; // base64
}

// --- DNS types ---

export interface DnsRecord {
  id: string;
  name: string;
  type: string;
  data: string;
  ttl: number;
  priority?: number;
  comment?: string;
}

export interface DnsZone {
  domain: string;
  subdomain: string;
  ns: string[];
  status: string;
}
