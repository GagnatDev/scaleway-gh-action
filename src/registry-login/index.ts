import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { validateRegion } from "../shared";
import type { ScalewayRegion } from "../shared/types";

function registryHost(region: ScalewayRegion): string {
  return `rg.${region}.scw.cloud`;
}

/**
 * registry-login action entry point.
 *
 * Runs `docker login` against the Scaleway Container Registry endpoint for
 * the given region and namespace. Saves the registry URL and the logout flag
 * in action state so the companion post.ts hook can run `docker logout` at
 * the end of the job.
 *
 * Outputs: registry (the full registry URL, e.g. rg.fr-par.scw.cloud/my-ns).
 */
async function run(): Promise<void> {
  try {
    const secretKey = core.getInput("secret_key", { required: true });
    const region = validateRegion(core.getInput("region", { required: false }));
    const namespace = core.getInput("registry_namespace", { required: true });
    const logout = core.getBooleanInput("logout");

    const host = registryHost(region);
    const registry = `${host}/${namespace}`;

    core.saveState("registry", registry);
    core.saveState("logout", logout.toString());

    core.info(`Logging in to Scaleway Container Registry: ${registry}`);

    core.setSecret(secretKey);

    const { exitCode, stderr } = await exec.getExecOutput("docker", [
      "login",
      registry,
      "-u", "nologin",
      "--password-stdin",
    ], {
      input: Buffer.from(secretKey),
      silent: true,
      ignoreReturnCode: true,
    });

    if (exitCode !== 0) {
      throw new Error(`docker login failed (exit code ${exitCode}): ${stderr}`);
    }

    core.setOutput("registry", registry);
    core.info(`Successfully authenticated with ${registry}`);
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

export { run };
if (require.main === module) {
  run();
}
