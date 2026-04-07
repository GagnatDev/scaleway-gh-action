import * as core from "@actions/core";
import { ScalewayClient } from "../shared";
import type { ScalewayRegion } from "../shared/types";

const DNS_API = "/domain/v2beta1/dns-zones";

/**
 * The Scaleway DNS API uses a PATCH with a "changes" array to
 * atomically modify records in a zone.
 *
 * Each change is one of: { add: {...} }, { set: {...} }, { delete: {...} }, { clear: {...} }
 */

interface DnsChange {
  add?: { records: DnsRecordPayload[] };
  set?: { records: DnsRecordPayload[]; id_fields: IdFields };
  delete?: { id_fields: IdFields };
  clear?: { id_fields: IdFields };
}

interface DnsRecordPayload {
  name: string;
  type: string;
  data: string;
  ttl: number;
}

interface IdFields {
  name: string;
  type: string;
}

interface PatchRecordsResponse {
  records: Array<{ id: string; name: string; type: string; data: string; ttl: number }>;
}

/**
 * dns-record action entry point.
 *
 * Modifies DNS records in a Scaleway DNS zone using a single atomic PATCH
 * request with a `changes` array. Dispatches based on `action`:
 *   - "add":    append a new record (fails if record_data is absent).
 *   - "set":    replace all matching records (fails if record_data is absent).
 *   - "delete": remove matching records by name+type.
 *   - "clear":  remove all records matching name+type.
 *
 * Note: The Scaleway DNS API is global — the region input is ignored and
 * "fr-par" is used internally so the client can be constructed.
 *
 * Outputs: records_changed (count of records in the API response).
 */
async function run(): Promise<void> {
  try {
    const secretKey = core.getInput("secret_key", { required: true });
    const dnsZone = core.getInput("dns_zone", { required: true });
    const action = core.getInput("action", { required: true });
    const recordName = core.getInput("record_name") || "";
    const recordType = core.getInput("record_type", { required: true });
    const recordData = core.getInput("record_data") || "";
    const ttl = parseInt(core.getInput("ttl") || "3600", 10);

    core.setSecret(secretKey);

    // DNS API is global, region is not used in the URL, but the client still needs one
    const client = new ScalewayClient({ secretKey, region: "fr-par" as ScalewayRegion });

    const change: DnsChange = {};
    const idFields: IdFields = { name: recordName, type: recordType };
    const record: DnsRecordPayload = {
      name: recordName,
      type: recordType,
      data: recordData,
      ttl,
    };

    switch (action) {
      case "add":
        if (!recordData) {
          core.setFailed("record_data is required for add action");
          return;
        }
        change.add = { records: [record] };
        core.info(`Adding ${recordType} record "${recordName}" -> ${recordData}`);
        break;

      case "set":
        if (!recordData) {
          core.setFailed("record_data is required for set action");
          return;
        }
        change.set = { records: [record], id_fields: idFields };
        core.info(`Setting ${recordType} record "${recordName}" -> ${recordData}`);
        break;

      case "delete":
        change.delete = { id_fields: idFields };
        core.info(`Deleting ${recordType} record "${recordName}"`);
        break;

      case "clear":
        change.clear = { id_fields: idFields };
        core.info(`Clearing all ${recordType} records for "${recordName}"`);
        break;

      default:
        core.setFailed(`Unknown action "${action}". Use add, set, delete, or clear.`);
        return;
    }

    const response = await client.patch<PatchRecordsResponse>(
      `${DNS_API}/${dnsZone}/records`,
      {
        changes: [change],
        return_all_records: false,
      },
    );

    const count = response.records?.length ?? 0;
    core.setOutput("records_changed", String(count));
    core.info(`DNS update complete. ${count} record(s) in response.`);
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

export { run };
if (require.main === module) {
  run();
}
