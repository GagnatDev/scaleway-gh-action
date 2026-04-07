import * as core from "@actions/core";
import { ScalewayClient, pollStatus } from "../shared";
import type { JobRun, ScalewayRegion } from "../shared/types";

const JOBS_API = "/serverless-jobs/v1alpha1/regions/{region}";

async function run(): Promise<void> {
  try {
    const secretKey = core.getInput("secret_key", { required: true });
    const region = core.getInput("region") as ScalewayRegion;
    const jobDefinitionId = core.getInput("job_definition_id", { required: true });
    const shouldWait = core.getInput("wait") !== "false";
    const timeoutSeconds = parseInt(core.getInput("timeout_seconds") || "600", 10);

    core.setSecret(secretKey);

    const client = new ScalewayClient({ secretKey, region });

    // Build optional overrides for the job start
    const body: Record<string, unknown> = {};

    const command = core.getInput("command");
    if (command) body.command = command;

    const memoryLimit = core.getInput("memory_limit");
    if (memoryLimit) body.memory_limit = parseInt(memoryLimit, 10);

    const cpuLimit = core.getInput("cpu_limit");
    if (cpuLimit) body.cpu_limit = parseInt(cpuLimit, 10);

    const envVarsRaw = core.getInput("environment_variables");
    if (envVarsRaw) {
      try {
        body.environment_variables = JSON.parse(envVarsRaw);
      } catch {
        core.warning("Failed to parse environment_variables as JSON, skipping");
      }
    }

    core.info(`Starting job definition ${jobDefinitionId}`);
    const jobRun = await client.post<JobRun>(
      `${JOBS_API}/job-definitions/${jobDefinitionId}/start`,
      body,
    );

    core.info(`Job run started: ${jobRun.id}`);
    core.setOutput("job_run_id", jobRun.id);

    if (!shouldWait) {
      core.setOutput("status", jobRun.status);
      core.info("Not waiting for job completion (wait=false).");
      return;
    }

    core.info(`Waiting up to ${timeoutSeconds}s for job to complete...`);
    const result = await pollStatus<JobRun>(client, {
      url: `${JOBS_API}/job-runs/${jobRun.id}`,
      successStatuses: new Set(["succeeded"]),
      failureStatuses: new Set(["failed", "canceled", "internal_error"]),
      timeoutMs: timeoutSeconds * 1000,
      intervalMs: 5_000,
    });

    const finalRun = result.data;
    const durationSec = Math.round(result.elapsedMs / 1000);

    core.setOutput("status", result.status);
    core.setOutput("duration_seconds", String(durationSec));

    if (result.status === "succeeded") {
      core.info(`Job completed successfully in ${durationSec}s`);
    } else {
      core.setFailed(
        `Job ended with status "${result.status}": ${finalRun.error_message || "unknown error"}`,
      );
    }
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

export { run };
if (require.main === module) {
  run();
}
