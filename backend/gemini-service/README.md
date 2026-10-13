# Horizon hosted Gemini backend

This personal-project service streams text, image and document answers without Google sign-in or invite codes. The Gemini credential stays in Secret Manager and is injected into the Cloud Run runtime. No provider key or OAuth secret is included in the desktop installer or source upload. The backend owns model selection, output limits and a persistent shared usage allowance. It answers questions; it does not execute desktop tools or supply an action planner.

**Deployment status:** the initial authenticated service is deployed, and the owner confirmed `/health` and `/ready`. The owner approved public access with the shared quota on 13 October 2026. The account-free source still needs redeployment with public access enabled, followed by a live answer test. Local fixtures do not establish live Gemini or Firestore availability. No cloud permissions have been changed by preparing this source.

## Existing resources

| Setting | Value |
| --- | --- |
| Project | `project-c7d759e1-7d06-4978-bc0` |
| Service / region | `horizon-backend` / `asia-south1` |
| Runtime account | `horizon-backend@project-c7d759e1-7d06-4978-bc0.iam.gserviceaccount.com` |
| Gemini secret | `gemini-horizon-key`, injected as `GEMINI_API_KEY` |
| Service URL | `https://horizon-backend-h7zgdbwiha-el.a.run.app` |
| Default secret version | `1`; use the actual enabled numbered version |

Keep the existing Gemini secret and service account. The earlier Desktop OAuth client and `horizon-oauth-client-secret` are no longer used; this update removes their runtime binding without deleting either cloud resource. No Google account allowlist or OAuth consent setup is needed. Never put a Gemini key in the settings file or download a service-account JSON key.

## Update from Cloud Shell

Use the existing checkout; no backend image needs to be selected. Cloud Run builds the self-contained service Dockerfile. The upload allowlist includes only package files, Dockerfile and server source.

```bash
cd ~/project-horizon/backend/gemini-service
git pull --ff-only
cp cloud-run.env.example.yaml cloud-run.env.yaml
HORIZON_SECRET_VERSION=1 HORIZON_PUBLIC_ACCESS=1 bash deploy.sh
```

The settings copy replaces obsolete OAuth and per-account settings with shared limits. Adjust the secret version if necessary. Deployment uses 512 MiB memory, one CPU, concurrency four, zero minimum instances, two maximum instances and a 145-second timeout. `HORIZON_PUBLIC_ACCESS=1` applies the owner's approved public-access choice using `--no-invoker-iam-check`. Omitting it (or setting it to `0`) deploys privately with `--invoker-iam-check --no-allow-unauthenticated`. Include the public setting on later deployments to keep ordinary desktop access working.

For a new deployment, enable Cloud Run, Cloud Build, Artifact Registry, Secret Manager and Firestore APIs. The runtime account needs **Secret Manager Secret Accessor** on `gemini-horizon-key` and **Cloud Datastore User** on the backend project. A Firestore Native mode `(default)` database holds usage records; the desktop never accesses it. The source-build account needs **Cloud Run Builder**, separate from the runtime account. Existing resources do not need recreation. See Google's [source-deployment permissions](https://docs.cloud.google.com/run/docs/deploying-source-code), [secret bindings](https://docs.cloud.google.com/run/docs/configuring/services/secrets) and [Firestore permissions](https://docs.cloud.google.com/firestore/native/docs/security/iam).

Verify through the authenticated local proxy:

```bash
gcloud run services proxy horizon-backend --region asia-south1 --project project-c7d759e1-7d06-4978-bc0
```

In a second terminal:

```bash
curl http://localhost:8080/health
curl http://localhost:8080/ready
curl -N http://localhost:8080/v1/answer -H 'Content-Type: application/json' -d '{"prompt":"Reply with: Horizon is ready"}'
```

Expected startup responses are `{"status":"ok"}` and `{"ready":true}`. Readiness checks the presence of a provider key, not live connectivity. The last request consumes model allowance and must end with a `done` event; an `error` event indicates a failed answer even if HTTP status was 200. Avoid `/healthz` on Cloud Run because some paths ending in `z` are [reserved](https://docs.cloud.google.com/run/docs/known-issues#reserved-url-paths).

## Public access decision

The owner approved public invocation with the shared allowance on 13 October 2026. Cloud Run IAM still protects the existing deployment until the public deployment command is run. Without accounts or invite codes, **anyone who knows the reachable URL can consume the shared model allowance**, and traffic can incur hosting costs. Request limits reduce usage but are not authentication, private access or a monetary cap. No reusable admin credential belongs in the desktop app. Google documents the flag under [public Cloud Run access](https://docs.cloud.google.com/run/docs/authenticating/public).

## API contract

`POST /v1/answer` accepts JSON without an application bearer token:

```json
{
  "prompt": "What does this diagram show?",
  "history": [{ "role": "user", "text": "Earlier question" }],
  "parts": [{ "text": "Inspected document excerpt" }]
}
```

Optional prepared images use `{ "inlineData": { "mimeType": "image/png", "data": "BASE64" } }`; JPEG and WebP are accepted. Up to 12 image parts accommodate three rendered pages from each of four source documents; up to four document excerpts are accepted. Native file scanning, PDF inspection, page selection and resizing remain on the desktop. Raw PDFs, executables and Office files are not parsed here. Context is treated as untrusted data; image text cannot be certified free of prompt injection. Answers have no tool execution path.

Prompts are limited to 12,000 characters, history to ten messages of 4,000 characters, each excerpt to 60,000 characters, incoming bodies to 20 MiB and prepared model payloads to 19 MiB. Clients cannot choose models, endpoint URLs, system instructions, tools, generation settings or quota identities. Removed `/v1/auth/exchange` and `/v1/auth/refresh` routes return 404.

Answers use SSE (`data: <JSON>\n\n`): `timing`, incremental `delta`, terminal `done`, or terminal `error`. A failure after partial text does not become a completed answer. Pre-stream usage denials return HTTP 429 with `Retry-After`. Disconnection aborts the model request. The server does not log prompts, attachments or keys; Cloud Run platform request logging is separate.

## Shared limits and latency

Defaults are **10 model attempts/minute**, **100/rolling 24 hours**, **two concurrent model calls**, and **768 output tokens per response**. All clients use the same Firestore `horizonUsage/global` record. Reservations are transactional, survive restarts and multiple instances, and occur before contacting Gemini. Failed or cancelled attempts retain their count; fallback calls count separately. Unavailable storage blocks inference. Active leases expire after the model timeout plus a margin if an instance crashes. Only timestamps and lease identifiers are stored. See [Firestore transactions](https://docs.cloud.google.com/firestore/native/docs/manage-data/transactions).

The owner selects `GEMINI_MODEL` and `GEMINI_FALLBACK_MODEL`. Defaults retain the existing `gemini-3.1-flash-lite` and `gemini-3.5-flash-lite` fallback. Fallback occurs only after an upstream 5xx before text begins. The per-attempt guard is 60 seconds; there is no seven-second completion guarantee. Timings include shared usage checks, provider headers, first text and stream completion. Keeping an instance warm can reduce startup delay and adds hosting usage.

Cloud Run source deployment requires billing enabled on the hosting project. The script checks and stops when disabled; it does not enable billing. Gemini tier follows the key's issuing project. Cloud Run, Firestore, Secret Manager, builds, image storage and networking have separate potential costs. Review [Gemini billing](https://ai.google.dev/gemini-api/docs/billing) and [Cloud Run pricing](https://cloud.google.com/run/pricing). Budget alerts and request caps do not guarantee a zero bill.

## Local verification

Use Node.js 22.13+ or 24:

```powershell
npm ci --ignore-scripts
npm test
npm audit --omit=dev
```

Tests use synthetic credentials, local HTTP servers, a transactional database adapter and mocked Gemini streams. They check account-free requests, shared quotas across different clients, persistence, concurrency, validation, streaming, cancellation and sanitized errors. They do not read a real key, call Gemini or modify Google Cloud. Real Cloud Run runtime, IAM and Firestore access still need deployment verification.
