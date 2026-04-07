import * as core from "@actions/core";
import { ScalewayClient, pollStatus, validateRegion } from "../shared";
import type { ContainerDomain } from "../shared/types";

const DOMAINS_API = "/containers/v1beta1/regions/{region}/domains";

async function attachDomain(client: ScalewayClient): Promise<void> {
  const containerId = core.getInput("container_id", { required: true });
  const hostname = core.getInput("hostname", { required: true });

  core.info(`Attaching domain "${hostname}" to container ${containerId}`);

  const domain = await client.post<ContainerDomain>(DOMAINS_API, {
    container_id: containerId,
    hostname,
  });

  core.info(`Domain mapping created: ${domain.id}`);

  // Wait for the domain to become ready (DNS propagation, TLS cert provisioning)
  core.info("Waiting for domain to become ready...");
  const result = await pollStatus<ContainerDomain>(client, {
    url: `${DOMAINS_API}/${domain.id}`,
    successStatuses: new Set(["ready"]),
    failureStatuses: new Set(["error"]),
    timeoutMs: 300_000, // 5 minutes for DNS + TLS
    intervalMs: 10_000,
  });

  const finalDomain = result.data;
  core.setOutput("domain_id", finalDomain.id);
  core.setOutput("url", finalDomain.url);
  core.setOutput("status", result.status);

  core.info(`Domain ready: ${finalDomain.url}`);
}

async function detachDomain(client: ScalewayClient): Promise<void> {
  const domainId = core.getInput("domain_id", { required: true });

  core.info(`Detaching domain ${domainId}`);
  await client.delete(`${DOMAINS_API}/${domainId}`);

  core.setOutput("domain_id", domainId);
  core.setOutput("status", "deleted");
  core.info(`Domain ${domainId} detached`);
}

async function run(): Promise<void> {
  try {
    const action = core.getInput("action", { required: true });
    const secretKey = core.getInput("secret_key", { required: true });
    const region = validateRegion(core.getInput("region"));

    core.setSecret(secretKey);

    const client = new ScalewayClient({ secretKey, region });

    switch (action) {
      case "attach":
        await attachDomain(client);
        break;
      case "detach":
        await detachDomain(client);
        break;
      default:
        core.setFailed(`Unknown action "${action}". Use attach or detach.`);
    }
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

export { run };
if (require.main === module) {
  run();
}
