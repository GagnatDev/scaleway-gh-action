import * as core from "@actions/core";
import * as exec from "@actions/exec";
import type { ScalewayRegion } from "../shared/types";

function registryHost(region: ScalewayRegion): string {
  return `rg.${region}.scw.cloud`;
}

async function run(): Promise<void> {
  try {
    const secretKey = core.getInput("secret_key", { required: true });
    const region = core.getInput("region", { required: false }) as ScalewayRegion;
    const namespace = core.getInput("registry_namespace", { required: true });

    const host = registryHost(region);
    const registry = `${host}/${namespace}`;

    core.info(`Logging in to Scaleway Container Registry: ${registry}`);

    // Mask the secret key so it never appears in logs
    core.setSecret(secretKey);

    await exec.exec("docker", [
      "login",
      registry,
      "-u", "nologin",
      "--password-stdin",
    ], {
      input: Buffer.from(secretKey),
    });

    core.setOutput("registry", registry);
    core.info(`Successfully authenticated with ${registry}`);
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

run();
