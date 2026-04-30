#!/usr/bin/env bash
# CW Leaders — Staging environment bootstrap
# Creates: lead-table-staging (DynamoDB) + Lambda aliases (`staging`) + S3 bucket
#          for staging assets. CloudFront staging distros are created on first deploy.
#
# Run once per region. Idempotent.

set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
ACCOUNT="069422358723"
STAGING_BUCKET="lead-staging-${ACCOUNT}"
STAGING_TABLE="lead-table-staging"

say() { printf "\033[1;36m▶\033[0m %s\n" "$*"; }
ok()  { printf "\033[1;32m✓\033[0m %s\n" "$*"; }

# 1) Staging DynamoDB table — same schema as prod
say "DynamoDB staging table"
if aws dynamodb describe-table --region "$REGION" --table-name "$STAGING_TABLE" >/dev/null 2>&1; then
  ok "  exists"
else
  aws dynamodb create-table --region "$REGION" \
    --table-name "$STAGING_TABLE" \
    --attribute-definitions \
      AttributeName=pk,AttributeType=S \
      AttributeName=sk,AttributeType=S \
      AttributeName=gsi1pk,AttributeType=S \
      AttributeName=gsi1sk,AttributeType=S \
    --key-schema AttributeName=pk,KeyType=HASH AttributeName=sk,KeyType=RANGE \
    --global-secondary-indexes \
      "IndexName=gsi1,KeySchema=[{AttributeName=gsi1pk,KeyType=HASH},{AttributeName=gsi1sk,KeyType=RANGE}],Projection={ProjectionType=ALL}" \
    --billing-mode PAY_PER_REQUEST \
    --tags Key=Project,Value=LEAD Key=Env,Value=staging >/dev/null
  aws dynamodb wait table-exists --region "$REGION" --table-name "$STAGING_TABLE"
  aws dynamodb update-time-to-live --region "$REGION" --table-name "$STAGING_TABLE" \
    --time-to-live-specification "Enabled=true, AttributeName=ttl" >/dev/null
  ok "  created"
fi

# 2) Staging S3 bucket
say "S3 staging bucket"
if aws s3api head-bucket --bucket "$STAGING_BUCKET" 2>/dev/null; then
  ok "  exists"
else
  aws s3api create-bucket --bucket "$STAGING_BUCKET" --region "$REGION" >/dev/null
  aws s3api put-bucket-versioning --bucket "$STAGING_BUCKET" \
    --versioning-configuration Status=Enabled >/dev/null
  ok "  created"
fi

# 3) Lambda aliases — `staging` pointing at $LATEST initially
say "Lambda aliases"
fns=$(aws lambda list-functions --region "$REGION" \
  --query 'Functions[?starts_with(FunctionName,`lead-`)].FunctionName' --output text)
for fn in $fns; do
  if ! aws lambda get-alias --function-name "$fn" --name staging --region "$REGION" >/dev/null 2>&1; then
    LATEST_VER=$(aws lambda publish-version --function-name "$fn" --region "$REGION" \
      --query Version --output text)
    aws lambda create-alias --function-name "$fn" --name staging \
      --function-version "$LATEST_VER" --region "$REGION" >/dev/null
    ok "  $fn → alias staging→v$LATEST_VER"
  fi
done

# 4) Print remaining (manual) steps
cat <<EOF

═══════════════════════════════════════════════════════════
  Staging bootstrapped. Remaining (manual, one-time):

  1. ACM cert for *.staging.cwleaders.com (us-east-1):
     aws acm request-certificate --domain-name "*.staging.cwleaders.com" \\
       --validation-method DNS --region us-east-1

  2. Add Route53 records for staging.cwleaders.com,
     staging-api.cwleaders.com, staging-studio.cwleaders.com.

  3. Add a separate API Gateway stage 'staging' on api id qizuwjquh9
     pointing routes to Lambda :staging aliases.

  4. Create CloudFront distros mirroring prod, origin = lead-staging-${ACCOUNT}/staging/<spa>/

  5. Wire env vars for staging Lambdas to use lead-table-staging.

  Each of these is in the deploy.sh family — to be added in a
  follow-up sprint per MIGRATION-ROADMAP.md.
═══════════════════════════════════════════════════════════
EOF
