import * as core from "@actions/core";
import {
  ScalewayClient,
  pollStatus,
  postContainerDeploy,
  getOptionalIntInput,
  getOptionalStringInput,
  getOptionalJsonInput,
  validateRegion,
} from "../shared";
import type { Container } from "../shared/types";

const CONTAINERS_API = "/containers/v1beta1/regions/{region}/containers";

/**
 * container-deploy action entry point.
 *
 * Performs a three-step deploy of an existing Serverless Container:
 *   1. PATCH the container config (registry image + optional overrides).
 *   2. POST to the deploy endpoint (retries on transient-state 409/400).
 *   3. Poll until status is "ready" or a terminal failure status is reached.
 *
 * Outputs: status, endpoint_url, deploy_duration_seconds.
 */
async function run(): Promise<void> {
  try {
    const secretKey = core.getInput("secret_key", { required: true });
    const region = validateRegion(core.getInput("region"));
    const containerId = core.getInput("container_id", { required: true });
    const registryImageUrl = core.getInput("registry_image_url", { required: true });
    const timeoutSeconds = parseInt(core.getInput("timeout_seconds") || "300", 10);

    core.setSecret(secretKey);

    const client = new ScalewayClient({ secretKey, region });

    // Build the PATCH body with only provided optional fields
    const patchBody: Record<string, unknown> = {
      registry_image: registryImageUrl,
    };

    const fields: Record<string, unknown> = {
      min_scale: getOptionalIntInput("min_scale"),
      max_scale: getOptionalIntInput("max_scale"),
      memory_limit: getOptionalIntInput("memory_limit"),
      cpu_limit: getOptionalIntInput("cpu_limit"),
      port: getOptionalIntInput("port"),
      http_option: getOptionalStringInput("http_option"),
      environment_variables: getOptionalJsonInput("environment_variables"),
      secret_environment_variables: getOptionalJsonInput("secret_environment_variables"),
    };

    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) patchBody[key] = value;
    }

    // Step 1: Update the container configuration
    core.info(`Updating container ${containerId} with image ${registryImageUrl}`);
    await client.patch<Container>(
      `${CONTAINERS_API}/${containerId}`,
      patchBody,
    );

    // Step 2: Trigger deployment
    core.info("Triggering deployment...");
    await postContainerDeploy(client, `${CONTAINERS_API}/${containerId}/deploy`, {});

    // Step 3: Poll until ready
    core.info(`Waiting up to ${timeoutSeconds}s for container to become ready...`);
    const result = await pollStatus<Container>(client, {
      url: `${CONTAINERS_API}/${containerId}`,
      successStatuses: new Set(["ready"]),
      failureStatuses: new Set(["error", "locked"]),
      timeoutMs: timeoutSeconds * 1000,
      intervalMs: 5_000,
    });

    const container = result.data;
    const durationSec = Math.round(result.elapsedMs / 1000);

    core.setOutput("status", result.status);
    core.setOutput("endpoint_url", `https://${container.domain_name}`);
    core.setOutput("deploy_duration_seconds", String(durationSec));

    core.info(
      `Container deployed successfully in ${durationSec}s. ` +
        `Endpoint: https://${container.domain_name}`,
    );
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

export { run };
if (require.main === module) {
  run();
}
