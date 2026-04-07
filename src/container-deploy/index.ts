import * as core from "@actions/core";
import { ScalewayClient, pollStatus, postContainerDeploy } from "../shared";
import type { Container, ScalewayRegion } from "../shared/types";

const CONTAINERS_API = "/containers/v1beta1/regions/{region}/containers";

async function run(): Promise<void> {
  try {
    const secretKey = core.getInput("secret_key", { required: true });
    const region = core.getInput("region") as ScalewayRegion;
    const containerId = core.getInput("container_id", { required: true });
    const registryImageUrl = core.getInput("registry_image_url", { required: true });
    const timeoutSeconds = parseInt(core.getInput("timeout_seconds") || "300", 10);

    core.setSecret(secretKey);

    const client = new ScalewayClient({ secretKey, region });

    // Build the PATCH body with only provided optional fields
    const patchBody: Record<string, unknown> = {
      registry_image: registryImageUrl,
    };

    const optionalInt = (name: string) => {
      const v = core.getInput(name);
      return v ? parseInt(v, 10) : undefined;
    };
    const optionalStr = (name: string) => core.getInput(name) || undefined;
    const optionalJson = (name: string) => {
      const v = core.getInput(name);
      if (!v) return undefined;
      try {
        return JSON.parse(v);
      } catch {
        core.warning(`Failed to parse ${name} as JSON, skipping`);
        return undefined;
      }
    };

    const fields: Record<string, unknown> = {
      min_scale: optionalInt("min_scale"),
      max_scale: optionalInt("max_scale"),
      memory_limit: optionalInt("memory_limit"),
      cpu_limit: optionalInt("cpu_limit"),
      port: optionalInt("port"),
      http_option: optionalStr("http_option"),
      environment_variables: optionalJson("environment_variables"),
      secret_environment_variables: optionalJson("secret_environment_variables"),
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
