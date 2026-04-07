# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install                    # Install dependencies
pnpm test                       # Run unit tests (vitest)
pnpm test:watch                 # Run tests in watch mode
pnpm run build                  # Build all 7 actions
pnpm run build:<action-name>    # Build a single action (e.g. build:container-deploy)
```

Available per-action build scripts: `build:registry-login`, `build:container-deploy`, `build:container-manage`, `build:job-run`, `build:secret-sync`, `build:dns-record`, `build:container-domain`.

Each build uses `@vercel/ncc` to bundle TypeScript into a single `dist/index.js` consumed by the GitHub Actions runtime. The `dist/` files must be committed.

## Architecture

This is a monorepo of 7 reusable GitHub Actions for managing Scaleway cloud resources. Each action has:
- A root-level directory with `action.yml` (inputs/outputs) and `dist/index.js` (committed bundle)
- A corresponding source directory under `src/<action-name>/index.ts`

### Shared utilities (`src/shared/`)

All actions import from here:

- **`client.ts`** — `ScalewayClient` class wrapping fetch with GET/POST/PATCH/DELETE, retry logic (3 retries, exponential backoff), and error formatting for Scaleway's detailed API error responses. Also contains `postContainerDeploy()` with special handling for transient-state retries (15 retries, 2–30s delays).
- **`poller.ts`** — Generic `pollStatus()` function for waiting on async resources (containers, domains, jobs). Configurable success/failure statuses, timeout, and interval.
- **`types.ts`** — TypeScript interfaces for all Scaleway API resource types.

### The 7 actions

| Action | Purpose |
|---|---|
| `registry-login` | Authenticates Docker CLI with Scaleway Container Registry; has a post-action hook (`post.ts`) that runs `docker logout` |
| `container-deploy` | Patches config and redeploys an existing Serverless Container; polls until ready |
| `container-manage` | Full lifecycle (create/update/delete) for Serverless Containers |
| `job-run` | Starts a Serverless Job; can wait for completion or return immediately |
| `secret-sync` | Creates or updates a secret in Scaleway Secret Manager |
| `dns-record` | Manages DNS records (add/set/delete/clear) in Scaleway DNS zones |
| `container-domain` | Attaches/detaches custom domains to Serverless Containers; polls for DNS + TLS provisioning |

### Key patterns

- Actions use `@actions/core` (`getInput`, `setOutput`, `setFailed`) for all I/O — never `process.env` or `console.log`.
- All async Scaleway operations follow the poll-until-terminal-state pattern via `pollStatus()`.
- Transient API states (e.g. a container mid-deploy) are retried inside `postContainerDeploy()` before surfacing as errors.
- Only `src/shared/` currently has unit tests; tests mock `fetch` globally using vitest.

## Development notes

- Package manager is **pnpm** (v10). Do not use npm or yarn.
- TypeScript target is ES2022 with CommonJS modules (required by `ncc`).
- Node.js runtime is v24 (matching the `node24` GitHub Actions runner).
- After changing any action's source, rebuild it (`pnpm run build:<action-name>`) and commit the updated `dist/index.js`.
