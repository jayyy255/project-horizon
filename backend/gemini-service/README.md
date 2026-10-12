# Horizon hosted Gemini backend

This service is prepared for Cloud Run. It reads the Gemini credential from a Secret Manager binding, verifies Google ID tokens, permits only configured accounts, and streams text/image/document answers. No Gemini key is included in this directory, the source upload, or the desktop installer.

**Status:** the owner deployed the initial service and confirmed `/health` and `/ready`. The 1.1.5 desktop source now uses this service for questions and has Google sign-in. The updated OAuth endpoints and second secret binding still need deployment, followed by a real signed-in answer test. Local fixture tests do not establish live Gemini availability. This service answers questions; it does not provide the desktop action planner or execute tools.

## Project configuration

| Setting | Value |
| --- | --- |
| Hosting project | `project-c7d759e1-7d06-4978-bc0` |
| Runtime service account | `horizon-backend@project-c7d759e1-7d06-4978-bc0.iam.gserviceaccount.com` |
| Secret | `gemini-horizon-key` |
| Secret environment variable | `GEMINI_API_KEY` |
| Desktop OAuth secret | `horizon-oauth-client-secret`, bound as `GOOGLE_OAUTH_CLIENT_SECRET` |
| Service URL | `https://horizon-backend-h7zgdbwiha-el.a.run.app` |
| Default secret version | `1`; select the actual enabled numbered version |
| Default region | `asia-south1` (Mumbai); choose alongside the Firestore database location |
| OAuth audience | Public desktop-client ID in `cloud-run.env.example.yaml` |

Your local `cloud-run.env.yaml` contains the two approved accounts and OAuth client ID. It is ignored by Git and excluded from the container/source upload. A Cloud Shell clone needs its own copy of that settings file. Account emails are not committed. OAuth client IDs, service-account emails, project IDs and secret names are identifiers, not credentials. Never put the Gemini key or OAuth tokens in this settings file.

## Billing before deployment

Preparing files and running these fixture tests does not enable Google Cloud billing or call Gemini. Normal Cloud Run source deployment requires a billing-enabled hosting project; the deployment script checks the status and stops if billing is disabled. It does not enable billing.

Gemini API keys inherit their issuing project's billing status. If that project remains on the Free Tier without billing, supported requests are free and constrained by the provider's quotas. Do not assume that a key stays free after billing is linked to its project. If you require Gemini Free Tier while using billed Cloud Run hosting, keep the Gemini key's issuing project separate from the billing-enabled hosting project, and store the key as a secret in the hosting project. Confirm the API project's tier in AI Studio. This configuration currently uses the supplied hosting project; select the project arrangement before deployment. [Gemini billing](https://ai.google.dev/gemini-api/docs/billing).

Cloud Run, Firestore, Secret Manager, Cloud Build, Artifact Registry and network traffic can incur charges. Scaling to zero and request limits reduce usage but do not guarantee a zero bill. Budget alerts do not impose a hard spending cap. [Cloud Run pricing](https://cloud.google.com/run/pricing), [budget alerts](https://docs.cloud.google.com/billing/docs/how-to/budgets).

## Deploy from Cloud Shell

The source folder is self-contained. Cloud Run builds its Dockerfile into an image; no existing backend image is needed. Do not deploy the whole desktop repository. The Docker/source upload allowlists include only the package files, Dockerfile and server source. [Source deployments](https://docs.cloud.google.com/run/docs/deploying-source-code).

1. Review billing and select your hosting project first. Enable the Cloud Run, Cloud Build, Artifact Registry, Secret Manager and Firestore APIs in that project. The account doing deployment needs the source-deployment permissions described in Google's guide.
2. Grant the runtime service account **Secret Manager Secret Accessor** on each of `gemini-horizon-key` and `horizon-oauth-client-secret`. The second secret holds the existing Desktop OAuth client's secret, not another Gemini key. Cloud Run injects both selected versions when each instance starts. Neither credential belongs in the desktop app. Do not create or download a JSON service-account key. [Secret binding](https://docs.cloud.google.com/run/docs/configuring/services/secrets).
3. Create a **Firestore Native mode** database named `(default)`, preferably in `asia-south1`. Set restrictive client rules; the desktop app never accesses Firestore. Grant the runtime service account **Cloud Datastore User** (`roles/datastore.user`) on this backend-only project so the server can update quota records. This role provides broader database access than just the usage collection, so avoid placing unrelated sensitive data in this project. [Firestore server permissions](https://docs.cloud.google.com/firestore/native/docs/security/iam).
4. Ensure the source-build service account has **Cloud Run Builder** (`roles/run.builder`). This is separate from the runtime account. Google uses the Compute Engine default account for source builds unless overridden; your Cloud Run source-deployment guide explains the binding.
5. Clone the repository in Cloud Shell and open the service directory:

   ```bash
   git clone https://github.com/jayyy255/project-horizon.git
   cd project-horizon/backend/gemini-service
   cp cloud-run.env.example.yaml cloud-run.env.yaml
   cloudshell edit cloud-run.env.yaml
   ```

   Set `ALLOWED_EMAILS` to the comma-separated approved Gmail addresses. The OAuth client ID is already in the example. Leave the Gemini key entirely in Secret Manager. Add the same accounts as test users in Google Auth Platform while the OAuth consent configuration is in testing.

6. Deploy the source, using the actual enabled secret version:

   ```bash
   HORIZON_SECRET_VERSION=1 HORIZON_OAUTH_SECRET_VERSION=1 bash deploy.sh
   ```

   The default is a private Cloud Run service with 512 MiB memory, one CPU, zero minimum instances, two maximum instances, concurrency four and a 145-second request timeout. The fixed deployment account, project and secret binding are visible in `deploy.sh`. Set `HORIZON_REGION` to override the region. Deploying to a different hosting project requires updating the script and the settings file together.

7. Verify that the service starts. Run `gcloud run services proxy horizon-backend --region asia-south1 --project project-c7d759e1-7d06-4978-bc0`, then request `/health` and `/ready` through the local proxy from a second terminal. Both should return 200 when the secret, allowlist and client ID are configured. Readiness is a configuration check, not proof that Gemini or Firestore are reachable. A real signed-in answer must be tested next. Avoid `/healthz` and other paths ending in `z`: Cloud Run reserves some of them and may return a Google 404 before the request reaches this server. [Reserved Cloud Run paths](https://docs.cloud.google.com/run/docs/known-issues#reserved-url-paths).

The deployment script keeps Cloud Run private. Desktop sign-in needs its OAuth exchange endpoint reachable before a user has a Google ID token. After reviewing the updated service and its denied-account tests, the owner must explicitly approve allowing requests to reach the app's authentication checks. Cloud Run IAM and Google sign-in are separate layers. All AI requests remain subject to signed-token verification, account allowlisting and durable quota enforcement even if the Cloud Run URL becomes reachable. No shared admin/service-account credential belongs in the app.

Desktop sign-in opens the system browser and uses a random loopback port, state, nonce and PKCE. `/v1/auth/exchange` exchanges the code through Google using the server-only OAuth client secret, verifies the returned ID token and allowlisted identity, and returns only that user's session. `/v1/auth/refresh` verifies the refreshed identity again. Both accept at most 16 KiB, and sign-in traffic is limited to 20 requests/minute per instance with at most four concurrent requests. These bootstrap limits are separate from persistent model quotas. Session tokens are encrypted with Windows account protection on the desktop; IPC exposes only account status. Sign-out removes this device's saved session and cancels a pending login; it does not revoke all Google sessions.

## API contract

`POST /v1/answer` requires `Authorization: Bearer <Google ID token>`. The server verifies Google's signature, issuer, expiry and configured OAuth audience using Google's auth library, then checks the verified account against the allowlist. Usage is keyed by the signed token's `sub`, never a client-supplied email or user ID. An empty allowlist or audience blocks inference. [Google token verification](https://developers.google.com/identity/sign-in/web/backend-auth).

```json
{
  "prompt": "What does this diagram show?",
  "history": [{ "role": "user", "text": "Earlier question" }],
  "parts": [{ "text": "Inspected document excerpt" }]
}
```

Optional prepared images use `{ "inlineData": { "mimeType": "image/png", "data": "BASE64" } }`; JPEG and WebP are also accepted. Up to 12 image parts allow up to three rendered pages for each of four source documents; up to four document excerpts are accepted. Native file scanning, PDF inspection, page selection and image resizing remain on the desktop. Raw PDFs, executables, Office files and arbitrary uploads are not parsed here. The server bounds and validates context but cannot certify that image text is free from prompt injection. Answers have no tool execution path.

Questions are limited to 12,000 characters, history to ten messages of 4,000 characters, each document excerpt to 60,000 characters, the incoming body to 20 MiB and the prepared model payload to 19 MiB. Clients cannot choose a model, endpoint URL, system instructions, tools or generation configuration. Model configuration belongs to the backend owner.

The response is SSE (`data: <JSON>\n\n`) with `timing`, incremental `delta`, terminal `done`, or terminal `error` events. A failure after partial text is an error, not a completed answer. A pre-stream access/usage denial returns an ordinary HTTP error; usage denials include `Retry-After`. A disconnected client aborts the upstream call. The server does not log prompts, images, document contents, tokens, keys or account emails. Cloud Run's platform request logging is separate.

## Usage limits

Default limits are **10 model attempts/minute and 100/rolling 24 hours per user**, with **20/minute and 200/rolling 24 hours across all users**. Concurrent model calls are limited to two per user and four globally. Each response is limited to 768 output tokens. These are request limits, not a monetary cap or exact token-spend ledger.

Firestore transactions reserve usage and active leases before contacting Gemini. Each fallback attempt counts separately. Counts persist across restarts and instances; unavailable quota storage blocks calls. Failed/cancelled attempts retain their reservation conservatively. Active leases expire after the model timeout plus a short margin if an instance crashes. Only hashed subject IDs, timestamps and lease identifiers are stored in the `horizonUsage` collection. [Firestore transaction behavior](https://docs.cloud.google.com/firestore/native/docs/manage-data/transactions).

The owner selects `GEMINI_MODEL` and `GEMINI_FALLBACK_MODEL` in the backend settings. Current defaults retain Horizon's `gemini-3.1-flash-lite` and `gemini-3.5-flash-lite` fallback. A fallback occurs only after an upstream 5xx response before text begins. The per-attempt connection guard is 60 seconds; there is no seven-second completion guarantee. Keeping an instance warm can reduce startup delay but incurs additional hosting usage.

## Local verification

Use Node.js 22.13+ or 24. From this directory:

```powershell
npm ci --ignore-scripts
npm test
npm audit --omit=dev
```

Or use `npm run test:hosted` from the repository root after installing this service's dependencies. Tests use synthetic credentials, a locally signed token verified by the real Google library, local HTTP servers, a transactional database test adapter and mocked Gemini streams. They do not read your Gemini key, call the real model or modify Google Cloud. Live IAM, Firestore transactions and Cloud Run image/runtime behavior still require verification after deployment.
