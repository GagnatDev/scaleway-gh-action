import * as core from "@actions/core";
import * as exec from "@actions/exec";

async function post(): Promise<void> {
  const registry = core.getState("registry");
  const logout = core.getState("logout");

  if (logout !== "true" || !registry) {
    return;
  }

  try {
    core.info(`Logging out of ${registry}`);

    const { exitCode, stderr } = await exec.getExecOutput("docker", [
      "logout",
      registry,
    ], {
      silent: true,
      ignoreReturnCode: true,
    });

    if (exitCode !== 0) {
      core.warning(`docker logout failed (exit code ${exitCode}): ${stderr}`);
      return;
    }

    core.info(`Successfully logged out of ${registry}`);
  } catch (error) {
    core.warning(error instanceof Error ? error.message : String(error));
  }
}

export { post };
if (require.main === module) {
  post();
}
