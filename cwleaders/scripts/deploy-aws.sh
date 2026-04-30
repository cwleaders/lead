#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

REGION="${AWS_REGION:-us-east-1}"
STACK_NAME="${STACK_NAME:-myhire-cwleaders-prod}"
DOMAIN_NAME="${DOMAIN_NAME:-myhire.cwleaders.com}"
HOSTED_ZONE_ID="${HOSTED_ZONE_ID:-Z05030081Z3KL9S2LPYR0}"
NOTIFICATION_EMAIL="${NOTIFICATION_EMAIL:-newapp@cwleaders.com}"
CONTACT_EMAIL="${CONTACT_EMAIL:-newapp@cwleaders.com}"
SES_FROM_EMAIL="${SES_FROM_EMAIL:-MyHire <no-reply@cwleaders.com>}"

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
ARTIFACT_BUCKET="${ARTIFACT_BUCKET:-myhire-cwleaders-artifacts-${ACCOUNT_ID}-${REGION}}"
SITE_BUCKET="${SITE_BUCKET:-myhire-cwleaders-site-${ACCOUNT_ID}-${REGION}}"
SUBMISSION_BUCKET="${SUBMISSION_BUCKET:-myhire-cwleaders-submissions-${ACCOUNT_ID}-${REGION}}"
RELEASE_ID="$(date -u +%Y%m%dT%H%M%SZ)"
ARTIFACT_KEY="myhire/releases/${RELEASE_ID}/applications.zip"

echo "Preparing MyHire release ${RELEASE_ID} in ${REGION} for ${DOMAIN_NAME}"

STACK_STATUS="$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query 'Stacks[0].StackStatus' --output text 2>/dev/null || true)"
if [[ "$STACK_STATUS" == "ROLLBACK_COMPLETE" ]]; then
  echo "Deleting previous rollback-complete stack ${STACK_NAME}"
  aws cloudformation delete-stack --stack-name "$STACK_NAME" --region "$REGION"
  aws cloudformation wait stack-delete-complete --stack-name "$STACK_NAME" --region "$REGION"
fi

npm test
npm run render:assets
npm run build:lambda

mkdir -p dist/lambda
rm -f dist/lambda/applications.zip
zip -j dist/lambda/applications.zip dist/lambda/applications.js >/dev/null

if ! aws s3api head-bucket --bucket "$ARTIFACT_BUCKET" 2>/dev/null; then
  echo "Creating artifact bucket ${ARTIFACT_BUCKET}"
  aws s3api create-bucket --bucket "$ARTIFACT_BUCKET" --region "$REGION" >/dev/null
fi

aws s3 cp dist/lambda/applications.zip "s3://${ARTIFACT_BUCKET}/${ARTIFACT_KEY}" >/dev/null

aws cloudformation deploy \
  --stack-name "$STACK_NAME" \
  --template-file infrastructure/template.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --region "$REGION" \
  --parameter-overrides \
    DomainName="$DOMAIN_NAME" \
    HostedZoneId="$HOSTED_ZONE_ID" \
    SiteBucketName="$SITE_BUCKET" \
    SubmissionBucketName="$SUBMISSION_BUCKET" \
    LambdaArtifactBucket="$ARTIFACT_BUCKET" \
    LambdaArtifactKey="$ARTIFACT_KEY" \
    NotificationEmail="$NOTIFICATION_EMAIL" \
    ContactEmail="$CONTACT_EMAIL" \
    SesFromEmail="$SES_FROM_EMAIL"

echo "Syncing site assets to s3://${SITE_BUCKET}"
aws s3 sync public/ "s3://${SITE_BUCKET}/" --delete --exclude "assets/*" --cache-control "public,max-age=300" >/dev/null
aws s3 sync public/assets/ "s3://${SITE_BUCKET}/assets/" --delete --cache-control "public,max-age=31536000,immutable" >/dev/null

DISTRIBUTION_ID="$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" --output text)"
SITE_URL="$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query "Stacks[0].Outputs[?OutputKey=='SiteUrl'].OutputValue" --output text)"
DIST_DOMAIN="$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query "Stacks[0].Outputs[?OutputKey=='DistributionDomainName'].OutputValue" --output text)"

aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths "/*" >/dev/null

echo "Deployment complete."
echo "Site URL: ${SITE_URL}"
echo "CloudFront domain: ${DIST_DOMAIN}"
echo "Distribution ID: ${DISTRIBUTION_ID}"
