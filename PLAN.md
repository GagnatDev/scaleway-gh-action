# Implementation Plan

Improvements to readability, maintainability, testing, and documentation — derived from
the code review. Each phase is self-contained and must have all tests passing before
moving on.

**Testing strategy**: mock at the two external interfaces every action depends on —
`fetch` (Scaleway HTTP API) and `@actions/core`/`@actions/exec` (GitHub Actions runtime).
No real HTTP calls. This is as end-to-end as unit tests can be for these actions.

---

## Phase 1 — Close shared utility test gaps

No production code changes. Adds missing test cases to the existing test files.

### 1a. `src/shared/client.test.ts`

| Test to add | Why |
|---|---|
| Retry exhaustion: fetch fails 3×, verify the last error is thrown | Ensures the retry cap works and the error isn't silently swallowed |
| Network error (fetch throws, not HTTP error): verify it is retried and eventually thrown | Fetch can throw (e.g. DNS failure); currently untested |
| Non-retryable 4xx (403, 404): verify it throws immediately without retry | Fast-fail on auth/not-found errors; a regression here would be silent |
| `invalid_arguments` with empty `details` array: verify raw body appears in message | Edge case documented in `formatScalewayErrorMessage` (line 151–157) but not tested |
| `permissions_denied` error type: verify action+resource appear in message | Companion to the existing `invalid_arguments` test |
| `quotas_exceeded` error type: verify resource+quota appear in message | Same |

### 1b. `src/shared/poller.test.ts`

| Test to add | Why |
|---|---|
| Response missing `statusField` entirely: verify status falls back to `"unknown"` and polling continues | Fallback on line 36 of `poller.ts` is untested |
| Custom `statusField` option: verify a non-default field name is used | The option exists but is never exercised in tests |
| Failure response without `error_message`: verify error still throws with "Unknown error" | Line 51 fallback untested |

**Phase 1 is done when**: `pnpm test` passes with all new cases green and no regressions.

---

## Phase 2 — Enable action unit testing (structural refactor)

Each action file currently ends with `run();`, which executes the action on import.
Tests must be able to import a module without triggering side effects. This phase makes
that possible with a minimal, mechanical change.

### Change per action file

Replace the bare `run();` call at the bottom of each file with:

```ts
export { run };
if (require.main === module) {
  run();
}
```

This is purely structural — no logic changes. Files to update:

- `src/container-deploy/index.ts`
- `src/container-manage/index.ts`
- `src/job-run/index.ts`
- `src/container-domain/index.ts`
- `src/secret-sync/index.ts`
- `src/dns-record/index.ts`
- `src/registry-login/index.ts`
- `src/registry-login/post.ts`

### Write the test harness before making the change

Before touching any action file, write `src/<action>/<action>.test.ts` for one action
(start with `secret-sync` — it's the simplest). The test file imports `run` and will
fail to compile or produce wrong results until the export is added. Then add the export
and confirm the test passes. Repeat for each remaining action.

The mock setup for all action tests looks like this:

```ts
// Mock @actions/core so getInput/setOutput/setFailed are controllable
vi.mock("@actions/core", () => ({
  getInput: vi.fn(),
  setOutput: vi.fn(),
  setFailed: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  setSecret: vi.fn(),
  saveState: vi.fn(),
  getState: vi.fn(),
  getBooleanInput: vi.fn(),
}));

// Mock fetch for Scaleway HTTP calls
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);
```

**Phase 2 is done when**: all action test files compile and `pnpm test` passes.

---

## Phase 3 — Action tests: simple actions

Write tests for the four simpler actions. Each test file follows the pattern from
Phase 2 and mocks at `fetch` + `@actions/core` level.

### `src/secret-sync/secret-sync.test.ts`

Scenarios to cover:

| Scenario | fetch mocks | Expected outputs |
|---|---|---|
| Happy path — secret exists: list returns 1 result, version POST succeeds | GET → `{secrets:[{id:"s-1"}]}`, POST → `{revision:3}` | `setOutput("secret_id","s-1")`, `setOutput("version_number","3")` |
| Happy path — secret does not exist: list empty, create then version | GET → `{secrets:[]}`, POST secret → `{id:"s-new"}`, POST version → `{revision:1}` | `setOutput("secret_id","s-new")`, `setOutput("version_number","1")` |
| Happy path — description provided on existing secret: verify PATCH is called | GET → existing, PATCH → `{}`, POST version → `{revision:2}` | PATCH called with `{description:"desc"}` |
| API failure on list: fetch returns 500 | GET → 500 | `setFailed` called with error message |
| API failure on version create | GET → existing, POST → 500 | `setFailed` called |

### `src/job-run/job-run.test.ts`

| Scenario | fetch mocks | Expected outputs |
|---|---|---|
| wait=false: job started, no polling | POST → `{id:"jr-1",status:"running"}` | `setOutput("job_run_id","jr-1")`, `setOutput("status","running")`, fetch called once |
| wait=true, succeeds: start then 2 polls | POST → `{id:"jr-1"}`, GET→`{status:"running"}`, GET→`{status:"succeeded"}` | `setOutput("status","succeeded")`, `setOutput("duration_seconds",…)` |
| wait=true, job fails | POST → `{id:"jr-1"}`, GET → `{status:"failed",error_message:"OOM"}` | `setFailed` called containing `"failed"` and `"OOM"` |
| Optional overrides (command, memory_limit, cpu_limit, env vars) | POST → success | POST body contains the override fields |

### `src/dns-record/dns-record.test.ts`

One test per action value, plus error cases:

| Scenario | Expected PATCH body |
|---|---|
| `add` | `changes:[{add:{records:[…]}}]` |
| `set` | `changes:[{set:{records:[…],id_fields:{…}}}]` |
| `delete` | `changes:[{delete:{id_fields:{…}}}]` |
| `clear` | `changes:[{clear:{id_fields:{…}}}]` |
| `add` with no `record_data` | `setFailed` called, fetch not called |
| Unknown action | `setFailed` called |
| API failure | `setFailed` called with error message |
| `records_changed` output: response has 2 records | `setOutput("records_changed","2")` |

### `src/registry-login/registry-login.test.ts`

`@actions/exec` must be mocked in addition to `@actions/core`:

```ts
vi.mock("@actions/exec", () => ({
  getExecOutput: vi.fn(),
}));
```

| Scenario | exec mock | Expected |
|---|---|---|
| Successful login | `getExecOutput` → `{exitCode:0,stderr:""}` | `setOutput("registry","rg.fr-par.scw.cloud/my-ns")`, `saveState` called |
| docker login fails (exitCode 1) | `{exitCode:1,stderr:"unauthorized"}` | `setFailed` called containing `"exit code 1"` and `"unauthorized"` |
| logout=true saved to state | happy path | `saveState("logout","true")` called |

Also add a test for `src/registry-login/post.ts`:

| Scenario | Expected |
|---|---|
| `getState("logout")==="true"`: docker logout is called | `getExecOutput` called with `"docker"`, `["logout","…"]` |
| `getState("logout")==="false"`: docker logout is NOT called | `getExecOutput` not called |

**Phase 3 is done when**: all four test files pass with `pnpm test`.

---

## Phase 4 — Action tests: complex actions

### `src/container-deploy/container-deploy.test.ts`

The three-step flow (PATCH → POST deploy → GET poll) gives clear seam points.

| Scenario | fetch mocks | Expected |
|---|---|---|
| Happy path | PATCH→ok, POST deploy→ok, GET→`{status:"ready",domain_name:"c.scw.cloud"}` | `setOutput("status","ready")`, `setOutput("endpoint_url","https://c.scw.cloud")` |
| PATCH fails | PATCH→500 | `setFailed` called, no further fetches |
| Deploy POST transient then succeeds | PATCH→ok, POST→400 transient, POST→ok, GET→ready | Two deploy POSTs, then success |
| Poll reaches error status | PATCH→ok, POST→ok, GET→`{status:"error"}` | `setFailed` called |
| Optional fields omitted: PATCH body only contains `registry_image` | no optional inputs | PATCH body has exactly `{registry_image:"…"}` |
| Optional fields provided: all are included in PATCH body | provide all inputs | PATCH body includes `min_scale`, `env_vars`, etc. |

### `src/container-manage/container-manage.test.ts`

One describe block per action value:

**`create`**

| Scenario | Expected |
|---|---|
| deploy=true, wait=true: POST → deploy POST → poll ready | `setOutput("container_id",…)`, `setOutput("status","ready")`, `setOutput("endpoint_url",…)` |
| deploy=true, wait=false: POST → deploy POST, no poll | `setOutput("container_id",…)`, GET not called |
| deploy=false: POST only | `setOutput("status", container.status)`, deploy POST not called |
| POST fails | `setFailed` called |

**`update`**

| Scenario | Expected |
|---|---|
| deploy=true, wait=true: PATCH → deploy POST → poll ready | `setOutput("status","ready")` |
| deploy=false: PATCH only | `setOutput("status","updated")` |

**`delete`**

| Scenario | Expected |
|---|---|
| Happy path | DELETE called, `setOutput("status","deleted")` |
| API failure | `setFailed` called |

**Unknown action**

| Expected |
|---|
| `setFailed` called with message containing the unknown value |

### `src/container-domain/container-domain.test.ts`

| Scenario | fetch mocks | Expected |
|---|---|---|
| `attach` happy path | POST domain → `{id:"d-1"}`, GET → `{status:"ready",url:"https://…",id:"d-1"}` | `setOutput("domain_id","d-1")`, `setOutput("url","https://…")`, `setOutput("status","ready")` |
| `attach` poll times out | POST → ok, GET always `{status:"pending"}` | `setFailed` called with "timed out" |
| `attach` poll reaches error | POST → ok, GET → `{status:"error"}` | `setFailed` called |
| `detach` happy path | DELETE → 204 | `setOutput("domain_id","d-1")`, `setOutput("status","deleted")` |
| `detach` API failure | DELETE → 500 | `setFailed` called |
| Unknown action | — | `setFailed` called |

**Phase 4 is done when**: all action test files pass with `pnpm test`.

---

## Phase 5 — Extract shared input helpers

Now that tests exist, the refactor is safe.

### What to extract

Three helper functions currently duplicated across `container-deploy` and
`container-manage` should move to `src/shared/`:

```ts
// src/shared/inputs.ts
export function getOptionalIntInput(name: string): number | undefined
export function getOptionalStringInput(name: string): string | undefined
export function getOptionalJsonInput(name: string): unknown | undefined
```

`getOptionalJsonInput` logs a `core.warning` on parse failure (matching existing
behaviour in both files).

### Test first

Write `src/shared/inputs.test.ts` before moving code. Mock `@actions/core` and cover:

| Case | Expected |
|---|---|
| `getOptionalIntInput` with valid int string | Returns the number |
| `getOptionalIntInput` with empty string | Returns `undefined` |
| `getOptionalStringInput` with value | Returns the string |
| `getOptionalStringInput` with empty string | Returns `undefined` |
| `getOptionalJsonInput` with valid JSON | Returns parsed object |
| `getOptionalJsonInput` with invalid JSON | Returns `undefined`, `core.warning` called |
| `getOptionalJsonInput` with empty string | Returns `undefined`, `core.warning` not called |

### Then update callers

- Remove the local helper definitions from `src/container-deploy/index.ts`
- Remove the local `getOptionalJson` from `src/container-manage/index.ts`
- Import from `../shared` in both files
- Re-run all existing tests to confirm nothing broke

Export `getOptionalIntInput`, `getOptionalStringInput`, `getOptionalJsonInput` from
`src/shared/index.ts`.

**Phase 5 is done when**: `pnpm test` passes including the new `inputs.test.ts`.

---

## Phase 6 — Input validation

Add early validation for enum inputs so failures are caught with a clear message
before any HTTP call is made.

### 6a. Region validation

Add a `validateRegion(value: string): ScalewayRegion` helper to `src/shared/`:

```ts
const VALID_REGIONS: ScalewayRegion[] = ["fr-par", "nl-ams", "pl-waw"];

export function validateRegion(value: string): ScalewayRegion {
  if (!VALID_REGIONS.includes(value as ScalewayRegion)) {
    throw new Error(
      `Invalid region "${value}". Must be one of: ${VALID_REGIONS.join(", ")}`
    );
  }
  return value as ScalewayRegion;
}
```

**Test first** in `src/shared/validation.test.ts`:

| Case | Expected |
|---|---|
| Valid region `"fr-par"` | Returns `"fr-par"` |
| Valid region `"nl-ams"` | Returns `"nl-ams"` |
| Valid region `"pl-waw"` | Returns `"pl-waw"` |
| Empty string | Throws with message containing valid region list |
| Unknown value `"us-east"` | Throws with message containing `"us-east"` |

Replace all `core.getInput("region") as ScalewayRegion` casts in action files with
`validateRegion(core.getInput("region"))`. Update each action's test to cover the
invalid-region error path.

`dns-record` hardcodes `"fr-par"` and must not call `validateRegion`.

### 6b. Action-value validation for multi-operation actions

For `container-manage`, `container-domain`, and `dns-record`, the `default` branch of
the `switch` already calls `core.setFailed`. This is fine — the existing action tests
for unknown values (added in Phase 3/4) already cover this. No code change needed;
this sub-phase is documentation only (covered in Phase 7).

**Phase 6 is done when**: `pnpm test` passes with region validation tests and all
action tests pass including invalid-region cases.

---

## Phase 7 — JSDoc and type documentation

No logic changes, no new tests needed. Purely additive.

### `src/shared/types.ts`

- Add a file-level JSDoc comment explaining what the file contains and linking to
  Scaleway API docs.
- Add brief JSDoc to each major interface (`Container`, `JobRun`, `Secret`, etc.)
  explaining what API resource it represents.
- Add inline comments to the status union types explaining the terminal states
  (e.g., `"ready"` and `"error"` are terminal for containers).

### `src/shared/client.ts`

- Add JSDoc to `ScalewayClient` class explaining the retry policy (3 attempts,
  exponential backoff, only 429/5xx retried).
- Add JSDoc to `ScalewayClient.request()` documenting the retry behaviour and the
  `logFailureAsDebug` flag.
- Add JSDoc to `postContainerDeploy()` documenting why the transient retry is separate
  from the general retry (different conditions, much higher attempt count).
- Add JSDoc to `isTransientResourceError()` with examples of what triggers it.
- Document the constants `MAX_RETRIES`, `RETRY_DELAY_MS`, and
  `DEPLOY_TRANSIENT_MAX_ATTEMPTS` with a one-line comment each explaining the rationale.

### `src/shared/poller.ts`

- Add JSDoc to `pollStatus()` documenting all parameters and the timeout behaviour.
- Note the `statusField` fallback to `"unknown"` in the JSDoc.

### `src/shared/inputs.ts` (new from Phase 5)

- Add JSDoc to each helper noting that `getOptionalJsonInput` logs a warning on parse
  failure.

### `src/shared/validation.ts` (new from Phase 6)

- Add JSDoc to `validateRegion()` listing the valid values.

### Action files

Add a top-of-file JSDoc block to each action's `run()` function documenting:
- What the action does at a high level
- Which steps it performs (e.g., the three-step PATCH → deploy → poll for
  `container-deploy`)
- Which outputs are conditional (e.g., `endpoint_url` is only set when `wait=true`
  in `container-manage`)

**Phase 7 is done when**: all JSDoc is in place and `pnpm test` still passes.

---

## Summary table

| Phase | What changes | Tests written first? |
|---|---|---|
| 1 | Add missing tests for `client.ts` and `poller.ts` | N/A — phase is only tests |
| 2 | Export `run()` + `require.main` guard in all 8 action files | Yes — write test skeleton first |
| 3 | Add tests for `secret-sync`, `job-run`, `dns-record`, `registry-login` | Yes — per-action TDD |
| 4 | Add tests for `container-deploy`, `container-manage`, `container-domain` | Yes — per-action TDD |
| 5 | Extract input helpers to `src/shared/inputs.ts` | Yes — `inputs.test.ts` first |
| 6 | Region validation helper + use in all actions | Yes — `validation.test.ts` first |
| 7 | JSDoc throughout | No tests required |
