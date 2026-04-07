import * as core from "@actions/core";
import { ScalewayClient } from "../shared";
import type { Secret, SecretVersion, ScalewayRegion } from "../shared/types";

const SECRETS_API = "/secret-manager/v1beta1/regions/{region}/secrets";

interface ListSecretsResponse {
  secrets: Secret[];
  total_count: number;
}

async function run(): Promise<void> {
  try {
    const secretKey = core.getInput("secret_key", { required: true });
    const region = core.getInput("region") as ScalewayRegion;
    const projectId = core.getInput("project_id", { required: true });
    const secretName = core.getInput("secret_name", { required: true });
    const secretValue = core.getInput("secret_value", { required: true });
    const description = core.getInput("description") || "";

    core.setSecret(secretKey);
    core.setSecret(secretValue);

    const client = new ScalewayClient({ secretKey, region });

    // Step 1: Check if the secret already exists
    core.info(`Looking for existing secret "${secretName}" in project ${projectId}`);
    const existing = await client.get<ListSecretsResponse>(
      `${SECRETS_API}?project_id=${projectId}&name=${encodeURIComponent(secretName)}`,
    );

    let secretId: string;

    if (existing.secrets.length > 0) {
      secretId = existing.secrets[0].id;
      core.info(`Found existing secret: ${secretId}`);

      // Optionally update the description
      if (description) {
        await client.patch(`${SECRETS_API}/${secretId}`, { description });
      }
    } else {
      // Step 2a: Create a new secret
      core.info(`Creating new secret "${secretName}"`);
      const newSecret = await client.post<Secret>(SECRETS_API, {
        project_id: projectId,
        name: secretName,
        description,
      });
      secretId = newSecret.id;
      core.info(`Secret created: ${secretId}`);
    }

    // Step 3: Create a new version with the value
    const encodedData = Buffer.from(secretValue, "utf-8").toString("base64");

    core.info("Creating new secret version...");
    const version = await client.post<SecretVersion>(
      `${SECRETS_API}/${secretId}/versions`,
      { data: encodedData },
    );

    core.setOutput("secret_id", secretId);
    core.setOutput("version_number", String(version.revision));

    core.info(`Secret version ${version.revision} created for "${secretName}"`);
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

export { run };
if (require.main === module) {
  run();
}
