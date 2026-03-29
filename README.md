# Scaleway GitHub Actions

A suite of reusable GitHub Actions for managing resources in [Scaleway](https://www.scaleway.com/) cloud.

## Actions

| Action | Description |
| --- | --- |
| [`registry-login`](#registry-login) | Authenticate Docker CLI with Scaleway Container Registry |
| [`container-deploy`](#container-deploy) | Deploy (redeploy) a Serverless Container and wait until ready |
| [`container-manage`](#container-manage) | Create, update, or delete Serverless Containers |
| [`job-run`](#job-run) | Start a Serverless Job and optionally wait for completion |
| [`secret-sync`](#secret-sync) | Sync secrets to Scaleway Secret Manager |
| [`dns-record`](#dns-record) | Manage DNS records in a Scaleway DNS zone |
| [`container-domain`](#container-domain) | Attach or detach a custom domain to/from a Serverless Container |

## Prerequisites

- A [Scaleway account](https://console.scaleway.com/) with an [API key](https://www.scaleway.com/en/docs/iam/how-to/create-api-keys/)
- Store `SCW_SECRET_KEY` as a [GitHub Actions secret](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions)

## Quick Start

A typical CI/CD workflow that builds, pushes, and deploys a container:

```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: gagnatdev/scaleway-gh-action/registry-login@v1
        id: registry
        with:
          secret_key: ${{ secrets.SCW_SECRET_KEY }}
          region: fr-par
          registry_namespace: my-app

      - run: |
          docker build -t ${{ steps.registry.outputs.registry }}/api:${{ github.sha }} .
          docker push ${{ steps.registry.outputs.registry }}/api:${{ github.sha }}

      - uses: gagnatdev/scaleway-gh-action/container-deploy@v1
        with:
          secret_key: ${{ secrets.SCW_SECRET_KEY }}
          region: fr-par
          container_id: ${{ vars.SCW_CONTAINER_ID }}
          registry_image_url: ${{ steps.registry.outputs.registry }}/api:${{ github.sha }}
          timeout_seconds: "300"
```

---

## registry-login

Authenticate Docker CLI with your Scaleway Container Registry namespace.

```yaml
- uses: gagnatdev/scaleway-gh-action/registry-login@v1
  with:
    secret_key: ${{ secrets.SCW_SECRET_KEY }}
    region: fr-par              # optional, default: fr-par
    registry_namespace: my-app  # required
```

**Outputs:**
- `registry` -- Full registry host (e.g. `rg.fr-par.scw.cloud/my-app`)

---

## container-deploy

Update an existing Serverless Container's image and redeploy it, then poll until it reaches `ready` status.

```yaml
- uses: gagnatdev/scaleway-gh-action/container-deploy@v1
  with:
    secret_key: ${{ secrets.SCW_SECRET_KEY }}
    region: fr-par
    container_id: <uuid>
    registry_image_url: rg.fr-par.scw.cloud/my-app/api:latest
    timeout_seconds: "300"
    # Optional overrides:
    # min_scale: "0"
    # max_scale: "10"
    # memory_limit: "512"
    # cpu_limit: "280"
    # port: "8080"
    # http_option: redirected
    # environment_variables: '{"NODE_ENV":"production"}'
    # secret_environment_variables: '[{"key":"DB_PASS","value":"xxx"}]'
```

**Outputs:**
- `status` -- Final container status
- `endpoint_url` -- Public endpoint URL
- `deploy_duration_seconds` -- Deploy duration

---

## container-manage

Full lifecycle management: create, update, or delete Serverless Containers.

```yaml
# Create a new container
- uses: gagnatdev/scaleway-gh-action/container-manage@v1
  with:
    action: create
    secret_key: ${{ secrets.SCW_SECRET_KEY }}
    region: fr-par
    namespace_id: <uuid>
    container_name: preview-pr-42
    registry_image: rg.fr-par.scw.cloud/my-app/api:pr-42
    min_scale: "0"
    max_scale: "1"
    deploy: "true"
    wait: "true"

# Delete a container
- uses: gagnatdev/scaleway-gh-action/container-manage@v1
  with:
    action: delete
    secret_key: ${{ secrets.SCW_SECRET_KEY }}
    region: fr-par
    container_id: <uuid>
```

**Outputs:**
- `container_id` -- UUID of the container
- `status` -- Final status
- `endpoint_url` -- Public endpoint URL (for create/update)

---

## job-run

Start a Serverless Job definition and optionally wait for it to complete. Useful for database migrations, batch processing, or smoke tests.

```yaml
- uses: gagnatdev/scaleway-gh-action/job-run@v1
  with:
    secret_key: ${{ secrets.SCW_SECRET_KEY }}
    region: fr-par
    job_definition_id: <uuid>
    wait: "true"
    timeout_seconds: "600"
    # Optional overrides:
    # command: "python migrate.py"
    # environment_variables: '{"DB_URL":"postgres://..."}'
```

**Outputs:**
- `job_run_id` -- UUID of the job run
- `status` -- Final status (`succeeded`, `failed`, etc.)
- `duration_seconds` -- How long the job ran

---

## secret-sync

Create or update a secret in Scaleway Secret Manager. Useful for syncing GitHub secrets to Scaleway so containers and jobs can reference them.

```yaml
- uses: gagnatdev/scaleway-gh-action/secret-sync@v1
  with:
    secret_key: ${{ secrets.SCW_SECRET_KEY }}
    region: fr-par
    project_id: <uuid>
    secret_name: DATABASE_URL
    secret_value: ${{ secrets.DATABASE_URL }}
    description: "Production database connection string"
```

**Outputs:**
- `secret_id` -- UUID of the secret
- `version_number` -- Revision number of the new version

---

## dns-record

Create, update, or delete DNS records in a Scaleway DNS zone.

```yaml
# Add a CNAME record
- uses: gagnatdev/scaleway-gh-action/dns-record@v1
  with:
    secret_key: ${{ secrets.SCW_SECRET_KEY }}
    dns_zone: example.com
    action: add
    record_name: api
    record_type: CNAME
    record_data: abc123.containers.scw.cloud.
    ttl: "3600"

# Delete a record
- uses: gagnatdev/scaleway-gh-action/dns-record@v1
  with:
    secret_key: ${{ secrets.SCW_SECRET_KEY }}
    dns_zone: example.com
    action: delete
    record_name: api
    record_type: CNAME
```

**Outputs:**
- `records_changed` -- Number of records affected

---

## container-domain

Attach or detach a custom domain to/from a Serverless Container. When attaching, waits for DNS + TLS provisioning to complete.

```yaml
# Attach a custom domain
- uses: gagnatdev/scaleway-gh-action/container-domain@v1
  id: domain
  with:
    action: attach
    secret_key: ${{ secrets.SCW_SECRET_KEY }}
    region: fr-par
    container_id: <uuid>
    hostname: api.example.com

# Detach a domain
- uses: gagnatdev/scaleway-gh-action/container-domain@v1
  with:
    action: detach
    secret_key: ${{ secrets.SCW_SECRET_KEY }}
    region: fr-par
    container_id: <uuid>
    domain_id: ${{ steps.domain.outputs.domain_id }}
```

**Outputs:**
- `domain_id` -- UUID of the domain mapping
- `url` -- URL of the domain
- `status` -- Domain status

---

## Development

```bash
npm install
npm test          # Run unit tests
npm run build     # Compile all actions with ncc
```

Each action's source lives in `src/<action-name>/index.ts` and shares a common Scaleway API client from `src/shared/`.

## License

MIT
