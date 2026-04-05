import * as core from "@actions/core";
import { ScalewayClient, pollStatus, postContainerDeploy } from "../shared";
import type { Container, ScalewayRegion } from "../shared/types";

const CONTAINERS_API = "/containers/v1beta1/regions/{region}/containers";

function getOptionalJson(name: string): unknown | undefined {
  const v = core.getInput(name);
  if (!v) return undefined;
  try {
    return JSON.parse(v);
  } catch {
    core.warning(`Failed to parse ${name} as JSON, skipping`);
    return undefined;
  }
}

async function createContainer(client: ScalewayClient): Promise<void> {
  const namespaceId = core.getInput("namespace_id", { required: true });
  const containerName = core.getInput("container_name", { required: true });
  const registryImage = core.getInput("registry_image", { required: true });

  const body: Record<string, unknown> = {
    namespace_id: namespaceId,
    name: containerName,
    registry_image: registryImage,
    min_scale: parseInt(core.getInput("min_scale") || "0", 10),
    max_scale: parseInt(core.getInput("max_scale") || "5", 10),
    memory_limit: parseInt(core.getInput("memory_limit") || "256", 10),
    cpu_limit: parseInt(core.getInput("cpu_limit") || "140", 10),
    port: parseInt(core.getInput("port") || "8080", 10),
    privacy: core.getInput("privacy") || "public",
    protocol: core.getInput("protocol") || "http1",
    http_option: core.getInput("http_option") || "enabled",
  };

  const desc = core.getInput("description");
  if (desc) body.description = desc;

  const envVars = getOptionalJson("environment_variables");
  if (envVars) body.environment_variables = envVars;

  const secretEnvVars = getOptionalJson("secret_environment_variables");
  if (secretEnvVars) body.secret_environment_variables = secretEnvVars;

  core.info(`Creating container "${containerName}" in namespace ${namespaceId}`);
  const container = await client.post<Container>(CONTAINERS_API, body);

  core.info(`Container created: ${container.id}`);
  core.setOutput("container_id", container.id);

  const shouldDeploy = core.getInput("deploy") !== "false";
  if (shouldDeploy) {
    core.info("Triggering deployment...");
    await postContainerDeploy(client, `${CONTAINERS_API}/${container.id}/deploy`, {});

    const shouldWait = core.getInput("wait") !== "false";
    if (shouldWait) {
      await waitForReady(client, container.id);
    }
  } else {
    core.setOutput("status", container.status);
    core.setOutput("endpoint_url", container.domain_name ? `https://${container.domain_name}` : "");
  }
}

async function updateContainer(client: ScalewayClient): Promise<void> {
  const containerId = core.getInput("container_id", { required: true });

  const body: Record<string, unknown> = {};

  const optionalFields: [string, (v: string) => unknown][] = [
    ["registry_image", (v) => v],
    ["min_scale", (v) => parseInt(v, 10)],
    ["max_scale", (v) => parseInt(v, 10)],
    ["memory_limit", (v) => parseInt(v, 10)],
    ["cpu_limit", (v) => parseInt(v, 10)],
    ["port", (v) => parseInt(v, 10)],
    ["privacy", (v) => v],
    ["protocol", (v) => v],
    ["http_option", (v) => v],
    ["description", (v) => v],
  ];

  for (const [name, transform] of optionalFields) {
    const v = core.getInput(name);
    if (v) body[name] = transform(v);
  }

  const envVars = getOptionalJson("environment_variables");
  if (envVars) body.environment_variables = envVars;

  const secretEnvVars = getOptionalJson("secret_environment_variables");
  if (secretEnvVars) body.secret_environment_variables = secretEnvVars;

  core.info(`Updating container ${containerId}`);
  await client.patch<Container>(`${CONTAINERS_API}/${containerId}`, body);

  const shouldDeploy = core.getInput("deploy") !== "false";
  if (shouldDeploy) {
    core.info("Triggering deployment...");
    await postContainerDeploy(client, `${CONTAINERS_API}/${containerId}/deploy`, {});

    const shouldWait = core.getInput("wait") !== "false";
    if (shouldWait) {
      await waitForReady(client, containerId);
    }
  } else {
    core.setOutput("container_id", containerId);
    core.setOutput("status", "updated");
  }
}

async function deleteContainer(client: ScalewayClient): Promise<void> {
  const containerId = core.getInput("container_id", { required: true });

  core.info(`Deleting container ${containerId}`);
  await client.delete(`${CONTAINERS_API}/${containerId}`);

  core.setOutput("container_id", containerId);
  core.setOutput("status", "deleted");
  core.info(`Container ${containerId} deleted`);
}

async function waitForReady(client: ScalewayClient, containerId: string): Promise<void> {
  const timeoutSeconds = parseInt(core.getInput("timeout_seconds") || "300", 10);

  core.info(`Waiting up to ${timeoutSeconds}s for container to become ready...`);
  const result = await pollStatus<Container>(client, {
    url: `${CONTAINERS_API}/${containerId}`,
    successStatuses: new Set(["ready"]),
    failureStatuses: new Set(["error", "locked"]),
    timeoutMs: timeoutSeconds * 1000,
    intervalMs: 5_000,
  });

  const container = result.data;
  core.setOutput("container_id", container.id);
  core.setOutput("status", result.status);
  core.setOutput("endpoint_url", `https://${container.domain_name}`);
  core.info(`Container ready. Endpoint: https://${container.domain_name}`);
}

async function run(): Promise<void> {
  try {
    const action = core.getInput("action", { required: true });
    const secretKey = core.getInput("secret_key", { required: true });
    const region = core.getInput("region") as ScalewayRegion;

    core.setSecret(secretKey);

    const client = new ScalewayClient({ secretKey, region });

    switch (action) {
      case "create":
        await createContainer(client);
        break;
      case "update":
        await updateContainer(client);
        break;
      case "delete":
        await deleteContainer(client);
        break;
      default:
        core.setFailed(`Unknown action "${action}". Use create, update, or delete.`);
    }
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

run();
