#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
project="project-c7d759e1-7d06-4978-bc0"
account="horizon-backend@${project}.iam.gserviceaccount.com"
region="${HORIZON_REGION:-asia-south1}"
version="${HORIZON_SECRET_VERSION:-1}"
if [[ ! "$version" =~ ^[1-9][0-9]*$ ]]; then
  echo 'Set HORIZON_SECRET_VERSION to a numbered secret version.' >&2; exit 1
fi
if [[ ! -f cloud-run.env.yaml ]]; then
  echo 'Copy cloud-run.env.example.yaml to cloud-run.env.yaml and add approved accounts.' >&2; exit 1
fi
if ! grep -Eq '^ALLOWED_EMAILS: "[^"[:space:]]+@[^"[:space:]]+"$' cloud-run.env.yaml; then
  echo 'Configure the approved Google-account allowlist first.' >&2; exit 1
fi
if grep -Eq '^GEMINI_API_KEY:' cloud-run.env.yaml; then
  echo 'Remove GEMINI_API_KEY from the settings file; it must come from Secret Manager.' >&2; exit 1
fi
if [[ "$(gcloud billing projects describe "$project" --format='value(billingEnabled)')" != "True" ]]; then
  echo 'Cloud Run source deployment needs a billing-enabled project. Billing was not changed.' >&2
  echo 'Review the Gemini project tier and hosting costs before enabling billing.' >&2; exit 1
fi
gcloud run deploy horizon-backend \
  --project "$project" --region "$region" --source . \
  --service-account "$account" \
  --set-secrets "GEMINI_API_KEY=gemini-horizon-key:${version}" \
  --env-vars-file cloud-run.env.yaml \
  --memory 512Mi --cpu 1 --concurrency 4 \
  --min-instances 0 --max-instances 2 --timeout 145 \
  --no-allow-unauthenticated
