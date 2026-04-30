#!/usr/bin/env bash
# LEAD ecosystem — idempotent AWS deploy
# Re-runs are safe: every step checks for existing resources first.
#
# Usage:
#   ./deploy.sh            # full deploy
#   ./deploy.sh frontend   # only re-sync SPA assets to S3 and invalidate CDN
#   ./deploy.sh lambdas    # only repackage + redeploy Lambdas
#   ./deploy.sh status     # print all resource IDs/URLs

set -euo pipefail

# ---------- CONFIG --------------------------------------------------------
ACCOUNT_ID="069422358723"
REGION="us-east-1"
HOSTED_ZONE_ID="Z05030081Z3KL9S2LPYR0"
CERT_ARN="arn:aws:acm:us-east-1:069422358723:certificate/d3c8505a-cad5-4929-b7c6-807861097624"
STUDIO_CERT_ARN="arn:aws:acm:us-east-1:069422358723:certificate/3eb6dfbc-a8c3-419a-9341-caa48aa43854"

TABLE_NAME="lead-table"
FILES_BUCKET="lead-files-${ACCOUNT_ID}"
PORTAL_BUCKET="lead-portal-${ACCOUNT_ID}"
UPLOAD_BUCKET="lead-upload-${ACCOUNT_ID}"
DOWNLOAD_BUCKET="lead-download-${ACCOUNT_ID}"
STUDIO_BUCKET="lead-studio-${ACCOUNT_ID}"
INSTALLERS_BUCKET="lead-installers-${ACCOUNT_ID}"
# MyHire uses the existing bucket from the legacy MyHire deployment
# (the existing CloudFront distribution at E1RHIQRNDR2YTV is wired to it).
# All new MyHire content syncs here.
MYHIRE_BUCKET="myhire-cwleaders-site-${ACCOUNT_ID}-us-east-1"

# Existing myhire cert (older deploy) used as fallback for the myhire CF distribution
MYHIRE_CERT_ARN="arn:aws:acm:us-east-1:069422358723:certificate/b514719a-bcd5-4844-a288-cd418f9b62d6"

LAMBDA_ROLE_NAME="lead-lambda-role"
API_NAME="lead-api"
API_DOMAIN="api.cwleaders.com"
PORTAL_DOMAIN="lead.cwleaders.com"
UPLOAD_DOMAIN="upload.cwleaders.com"
DOWNLOAD_DOMAIN="download.cwleaders.com"
STUDIO_DOMAIN="studio.cwleaders.com"
MYHIRE_DOMAIN="myhire.cwleaders.com"

# Cognito (created but unused in MVP — wires up for desktop app later)
USER_POOL_NAME="lead-user-pool"
USER_POOL_CLIENT_NAME="lead-app-client"

# Repo paths
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LAMBDAS_DIR="$ROOT/backend/lambdas"
BUILD_DIR="$ROOT/backend/.build"
STATE_FILE="$ROOT/backend/infra/.state.env"

mkdir -p "$BUILD_DIR"
touch "$STATE_FILE"

# ---------- HELPERS -------------------------------------------------------
say()    { printf "\033[1;36m▶\033[0m %s\n" "$*"; }
ok()     { printf "\033[1;32m✓\033[0m %s\n" "$*"; }
warn()   { printf "\033[1;33m!\033[0m %s\n" "$*"; }
fail()   { printf "\033[1;31m✗\033[0m %s\n" "$*"; exit 1; }
state_set() {
  local k="$1" v="$2"
  if grep -q "^${k}=" "$STATE_FILE" 2>/dev/null; then
    sed -i '' "s|^${k}=.*|${k}=${v}|" "$STATE_FILE"
  else
    echo "${k}=${v}" >> "$STATE_FILE"
  fi
}
state_get() { grep "^${1}=" "$STATE_FILE" 2>/dev/null | tail -1 | cut -d= -f2-; }

# ---------- 1. DYNAMODB ---------------------------------------------------
deploy_dynamo() {
  say "DynamoDB: $TABLE_NAME"
  if aws dynamodb describe-table --region "$REGION" --table-name "$TABLE_NAME" >/dev/null 2>&1; then
    ok "table exists"
  else
    aws dynamodb create-table --region "$REGION" \
      --table-name "$TABLE_NAME" \
      --attribute-definitions \
        AttributeName=pk,AttributeType=S \
        AttributeName=sk,AttributeType=S \
        AttributeName=gsi1pk,AttributeType=S \
        AttributeName=gsi1sk,AttributeType=S \
        AttributeName=gsi2pk,AttributeType=S \
        AttributeName=gsi2sk,AttributeType=S \
      --key-schema AttributeName=pk,KeyType=HASH AttributeName=sk,KeyType=RANGE \
      --global-secondary-indexes \
        "IndexName=gsi1,KeySchema=[{AttributeName=gsi1pk,KeyType=HASH},{AttributeName=gsi1sk,KeyType=RANGE}],Projection={ProjectionType=ALL}" \
        "IndexName=gsi2,KeySchema=[{AttributeName=gsi2pk,KeyType=HASH},{AttributeName=gsi2sk,KeyType=RANGE}],Projection={ProjectionType=ALL}" \
      --billing-mode PAY_PER_REQUEST \
      --tags Key=Project,Value=LEAD >/dev/null
    say "  waiting for table ACTIVE..."
    aws dynamodb wait table-exists --region "$REGION" --table-name "$TABLE_NAME"
    aws dynamodb update-time-to-live --region "$REGION" --table-name "$TABLE_NAME" \
      --time-to-live-specification "Enabled=true, AttributeName=ttl" >/dev/null
    ok "table created with TTL on 'ttl' attribute"
  fi
  state_set TABLE_NAME "$TABLE_NAME"
}

# ---------- 2. S3 BUCKETS -------------------------------------------------
ensure_bucket() {
  local b="$1"
  if aws s3api head-bucket --bucket "$b" >/dev/null 2>&1; then
    ok "  bucket $b exists"
  else
    aws s3api create-bucket --bucket "$b" --region "$REGION" >/dev/null
    aws s3api put-bucket-tagging --bucket "$b" --tagging "TagSet=[{Key=Project,Value=LEAD}]" >/dev/null
    ok "  bucket $b created"
  fi
  # Block public access (we use CloudFront OAC for static sites)
  aws s3api put-public-access-block --bucket "$b" \
    --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" >/dev/null
}

deploy_s3() {
  say "S3 buckets"
  ensure_bucket "$FILES_BUCKET"
  ensure_bucket "$PORTAL_BUCKET"
  ensure_bucket "$UPLOAD_BUCKET"
  ensure_bucket "$DOWNLOAD_BUCKET"
  ensure_bucket "$STUDIO_BUCKET"
  ensure_bucket "$INSTALLERS_BUCKET"
  ensure_bucket "$MYHIRE_BUCKET"

  # CORS on files bucket — allow upload from upload.cwleaders.com
  cat > "$BUILD_DIR/cors.json" <<JSON
{
  "CORSRules": [{
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT","GET","HEAD","POST"],
    "AllowedOrigins": [
      "https://upload.cwleaders.com",
      "https://download.cwleaders.com",
      "https://lead.cwleaders.com",
      "https://myhire.cwleaders.com",
      "https://studio.cwleaders.com",
      "http://localhost:8080",
      "http://localhost:5173"
    ],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }]
}
JSON
  aws s3api put-bucket-cors --bucket "$FILES_BUCKET" --cors-configuration "file://$BUILD_DIR/cors.json" >/dev/null
  ok "  CORS configured on $FILES_BUCKET"

  # Lifecycle: anonymous uploads under files/ expire in 1 day if tagged anon=true
  cat > "$BUILD_DIR/lifecycle.json" <<JSON
{
  "Rules": [{
    "ID": "purge-anon-uploads",
    "Status": "Enabled",
    "Filter": { "Prefix": "files/" },
    "Expiration": { "Days": 7 }
  }, {
    "ID": "abort-multipart",
    "Status": "Enabled",
    "Filter": { "Prefix": "" },
    "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 1 }
  }]
}
JSON
  aws s3api put-bucket-lifecycle-configuration --bucket "$FILES_BUCKET" \
    --lifecycle-configuration "file://$BUILD_DIR/lifecycle.json" >/dev/null
  ok "  lifecycle rules applied to $FILES_BUCKET"
}

# ---------- 3. COGNITO ----------------------------------------------------
deploy_cognito() {
  say "Cognito user pool: $USER_POOL_NAME"
  local pool_id
  pool_id=$(aws cognito-idp list-user-pools --max-results 60 --region "$REGION" \
    --query "UserPools[?Name=='$USER_POOL_NAME'].Id | [0]" --output text 2>/dev/null || true)
  if [ -z "$pool_id" ] || [ "$pool_id" = "None" ]; then
    pool_id=$(aws cognito-idp create-user-pool --region "$REGION" \
      --pool-name "$USER_POOL_NAME" \
      --policies "PasswordPolicy={MinimumLength=10,RequireUppercase=true,RequireLowercase=true,RequireNumbers=true,RequireSymbols=false}" \
      --auto-verified-attributes email \
      --username-attributes email \
      --user-pool-tags Project=LEAD \
      --query "UserPool.Id" --output text)
    ok "  pool created: $pool_id"
  else
    ok "  pool exists: $pool_id"
  fi
  state_set USER_POOL_ID "$pool_id"

  local client_id
  client_id=$(aws cognito-idp list-user-pool-clients --user-pool-id "$pool_id" --region "$REGION" \
    --query "UserPoolClients[?ClientName=='$USER_POOL_CLIENT_NAME'].ClientId | [0]" --output text 2>/dev/null || true)
  if [ -z "$client_id" ] || [ "$client_id" = "None" ]; then
    client_id=$(aws cognito-idp create-user-pool-client --region "$REGION" \
      --user-pool-id "$pool_id" \
      --client-name "$USER_POOL_CLIENT_NAME" \
      --no-generate-secret \
      --explicit-auth-flows ALLOW_USER_SRP_AUTH ALLOW_REFRESH_TOKEN_AUTH \
      --query "UserPoolClient.ClientId" --output text)
    ok "  client created: $client_id"
  else
    ok "  client exists: $client_id"
  fi
  state_set USER_POOL_CLIENT_ID "$client_id"
}

# ---------- 4. IAM ROLE FOR LAMBDAS --------------------------------------
deploy_iam() {
  say "IAM role: $LAMBDA_ROLE_NAME"
  local role_arn
  if aws iam get-role --role-name "$LAMBDA_ROLE_NAME" >/dev/null 2>&1; then
    role_arn=$(aws iam get-role --role-name "$LAMBDA_ROLE_NAME" --query "Role.Arn" --output text)
    ok "  role exists: $role_arn"
  else
    cat > "$BUILD_DIR/trust.json" <<JSON
{ "Version": "2012-10-17", "Statement": [{
  "Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"
}]}
JSON
    role_arn=$(aws iam create-role --role-name "$LAMBDA_ROLE_NAME" \
      --assume-role-policy-document "file://$BUILD_DIR/trust.json" \
      --tags Key=Project,Value=LEAD \
      --query "Role.Arn" --output text)
    ok "  role created: $role_arn"
    sleep 6  # IAM eventual consistency
  fi
  state_set LAMBDA_ROLE_ARN "$role_arn"

  # Inline policy (least-privilege, scoped to LEAD resources)
  cat > "$BUILD_DIR/policy.json" <<JSON
{ "Version": "2012-10-17", "Statement": [
  { "Effect":"Allow", "Action":["logs:CreateLogGroup","logs:CreateLogStream","logs:PutLogEvents"],
    "Resource":"arn:aws:logs:${REGION}:${ACCOUNT_ID}:*" },
  { "Effect":"Allow",
    "Action":["dynamodb:GetItem","dynamodb:PutItem","dynamodb:UpdateItem","dynamodb:DeleteItem","dynamodb:Query","dynamodb:BatchWriteItem"],
    "Resource":[
      "arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/${TABLE_NAME}",
      "arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/${TABLE_NAME}/index/*"
    ]},
  { "Effect":"Allow",
    "Action":["s3:PutObject","s3:GetObject","s3:DeleteObject","s3:AbortMultipartUpload","s3:ListMultipartUploadParts","s3:CopyObject"],
    "Resource":["arn:aws:s3:::${FILES_BUCKET}/*","arn:aws:s3:::${INSTALLERS_BUCKET}/*"] },
  { "Effect":"Allow",
    "Action":["s3:ListBucket","s3:ListBucketMultipartUploads"],
    "Resource":["arn:aws:s3:::${FILES_BUCKET}","arn:aws:s3:::${INSTALLERS_BUCKET}"] },
  { "Effect":"Allow", "Action":["lambda:InvokeFunction"],
    "Resource":"arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:lead-*" },
  { "Effect":"Allow", "Action":["ses:SendEmail","ses:SendRawEmail"],
    "Resource":"*" }
]}
JSON
  aws iam put-role-policy --role-name "$LAMBDA_ROLE_NAME" \
    --policy-name lead-lambda-policy --policy-document "file://$BUILD_DIR/policy.json"
  ok "  policy attached"
}

# ---------- 5. LAMBDAS ----------------------------------------------------
package_lambda() {
  local fn="$1"
  local src="$LAMBDAS_DIR/$fn"
  local out="$BUILD_DIR/$fn"
  rm -rf "$out"
  mkdir -p "$out"
  cp "$src/index.mjs" "$out/index.mjs"
  cp "$LAMBDAS_DIR/_shared.mjs" "$out/_shared.mjs"
  local files=(index.mjs _shared.mjs)
  for helper in _entitlements.mjs _agents.mjs _ai.mjs _email-templates.mjs; do
    if grep -q "from './${helper}'" "$src/index.mjs" 2>/dev/null; then
      cp "$LAMBDAS_DIR/$helper" "$out/$helper"
      files+=("$helper")
    fi
  done
  # _agents.mjs depends on _ai.mjs — bundle transitively
  if [[ " ${files[*]} " == *" _agents.mjs "* ]] && [ ! -f "$out/_ai.mjs" ]; then
    cp "$LAMBDAS_DIR/_ai.mjs" "$out/_ai.mjs"
    files+=(_ai.mjs)
  fi
  ( cd "$out" && zip -q -r function.zip "${files[@]}" )
  echo "$out/function.zip"
}

deploy_lambda() {
  local fn="$1"; shift
  local handler="$1"; shift
  local timeout="${1:-15}"; shift || true
  local memory="${1:-512}"; shift || true
  local extra_env="${1:-}"

  local zip_path
  zip_path=$(package_lambda "$fn")
  local fn_name="lead-${fn}"
  local role_arn
  role_arn=$(state_get LAMBDA_ROLE_ARN)

  local env_str="LEAD_TABLE=${TABLE_NAME},LEAD_FILES_BUCKET=${FILES_BUCKET},LEAD_CDN_DOMAIN=${DOWNLOAD_DOMAIN},RECEIPT_FN_NAME=lead-visual-receipt,INSTALLERS_BUCKET=${INSTALLERS_BUCKET},AWS_ACCOUNT_ID=${ACCOUNT_ID},RUNTIME_FN_NAME=lead-agent-runtime"
  [ -n "$extra_env" ] && env_str="${env_str},${extra_env}"

  if aws lambda get-function --function-name "$fn_name" --region "$REGION" >/dev/null 2>&1; then
    aws lambda update-function-code --region "$REGION" --function-name "$fn_name" \
      --zip-file "fileb://$zip_path" --publish >/dev/null
    aws lambda wait function-updated --region "$REGION" --function-name "$fn_name"
    aws lambda update-function-configuration --region "$REGION" --function-name "$fn_name" \
      --timeout "$timeout" --memory-size "$memory" \
      --environment "Variables={${env_str}}" >/dev/null
    ok "  updated $fn_name"
  else
    aws lambda create-function --region "$REGION" \
      --function-name "$fn_name" \
      --runtime nodejs20.x --architectures arm64 \
      --role "$role_arn" \
      --handler "$handler" \
      --timeout "$timeout" --memory-size "$memory" \
      --zip-file "fileb://$zip_path" \
      --environment "Variables={${env_str}}" \
      --tags Project=LEAD >/dev/null
    aws lambda wait function-active-v2 --region "$REGION" --function-name "$fn_name"
    ok "  created $fn_name"
  fi
  state_set "FN_$(echo $fn | tr 'a-z-' 'A-Z_')" "$fn_name"
}

deploy_lambdas() {
  say "Lambdas (Node.js 20.x · arm64)"
  deploy_lambda "presign-upload"   "index.handler" 15 512
  deploy_lambda "complete-upload"  "index.handler" 30 512
  deploy_lambda "get-file"         "index.handler" 10 256
  deploy_lambda "visual-receipt"   "index.handler" 60 1024
  deploy_lambda "license-validate" "index.handler" 10 256
  deploy_lambda "stripe-webhook"   "index.handler" 30 512
  deploy_lambda "waitlist"         "index.handler" 10 256
  # Phase 2 additions:
  deploy_lambda "auth-request"     "index.handler" 10 256
  deploy_lambda "auth-verify"      "index.handler" 10 256
  deploy_lambda "auth-me"          "index.handler" 10 256
  deploy_lambda "auth-firebase"    "index.handler" 10 256
  deploy_lambda "auth-profile"     "index.handler" 10 256
  deploy_lambda "checkout-session" "index.handler" 15 256
  deploy_lambda "admin-snapshot"   "index.handler" 15 512
  # Bossware (Tier 4) backend:
  deploy_lambda "enterprise-org"   "index.handler" 15 512
  deploy_lambda "telemetry-ingest" "index.handler" 10 256
  # MyHire integration:
  deploy_lambda "myhire-applications" "index.handler" 30 512
  deploy_lambda "skillcheck"          "index.handler" 15 256
  # Desktop app distribution + auto-update:
  deploy_lambda "desktop-update"      "index.handler" 10 256
  deploy_lambda "desktop-download"    "index.handler" 10 256
  # Agentic foundation:
  deploy_lambda "agent-runtime"       "index.handler" 60 768
  deploy_lambda "agent-scheduler"     "index.handler" 60 256
}

# ---------- 6. API GATEWAY (HTTP API v2) ---------------------------------
deploy_api() {
  say "API Gateway: $API_NAME"
  local api_id
  api_id=$(aws apigatewayv2 get-apis --region "$REGION" \
    --query "Items[?Name=='$API_NAME'].ApiId | [0]" --output text 2>/dev/null || true)
  if [ -z "$api_id" ] || [ "$api_id" = "None" ]; then
    api_id=$(aws apigatewayv2 create-api --region "$REGION" \
      --name "$API_NAME" \
      --protocol-type HTTP \
      --cors-configuration "AllowOrigins=https://lead.cwleaders.com,https://upload.cwleaders.com,https://download.cwleaders.com,http://localhost:8080,http://localhost:5173,AllowMethods=GET,POST,PUT,DELETE,OPTIONS,AllowHeaders=content-type,authorization,MaxAge=600" \
      --tags Project=LEAD \
      --query "ApiId" --output text)
    ok "  api created: $api_id"
  else
    ok "  api exists: $api_id"
  fi
  state_set API_ID "$api_id"

  # Helper: create integration + route if missing
  add_route() {
    local method="$1"; local path="$2"; local fn_name="$3"
    local fn_arn="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${fn_name}"

    local integ_id
    integ_id=$(aws apigatewayv2 get-integrations --api-id "$api_id" --region "$REGION" \
      --query "Items[?IntegrationUri=='$fn_arn'].IntegrationId | [0]" --output text 2>/dev/null || true)
    if [ -z "$integ_id" ] || [ "$integ_id" = "None" ]; then
      integ_id=$(aws apigatewayv2 create-integration --api-id "$api_id" --region "$REGION" \
        --integration-type AWS_PROXY \
        --integration-uri "$fn_arn" \
        --integration-method POST \
        --payload-format-version 2.0 \
        --query "IntegrationId" --output text)
    fi

    local route_key="${method} ${path}"
    local route_id
    route_id=$(aws apigatewayv2 get-routes --api-id "$api_id" --region "$REGION" \
      --query "Items[?RouteKey=='$route_key'].RouteId | [0]" --output text 2>/dev/null || true)
    if [ -z "$route_id" ] || [ "$route_id" = "None" ]; then
      aws apigatewayv2 create-route --api-id "$api_id" --region "$REGION" \
        --route-key "$route_key" \
        --target "integrations/$integ_id" >/dev/null
    fi

    # Lambda statement-ids must match [a-zA-Z0-9_-] only
    local stmt_id="apigw-$(echo "${method}-${path}" | tr -c 'a-zA-Z0-9' '-' | tr -s '-' | sed 's/-$//')"
    aws lambda add-permission --region "$REGION" \
      --function-name "$fn_name" \
      --statement-id "$stmt_id" \
      --action lambda:InvokeFunction \
      --principal apigateway.amazonaws.com \
      --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${api_id}/*/*" 2>/dev/null || true
  }

  add_route "POST" "/files/presign"       "lead-presign-upload"
  add_route "POST" "/files/complete"      "lead-complete-upload"
  add_route "GET"  "/files/{token}"       "lead-get-file"
  add_route "GET"  "/files/{token}/dl"    "lead-get-file"
  add_route "POST" "/license/validate"    "lead-license-validate"
  add_route "POST" "/stripe/webhook"      "lead-stripe-webhook"
  add_route "POST" "/waitlist"            "lead-waitlist"
  # Auth
  add_route "POST" "/auth/request"        "lead-auth-request"
  add_route "POST" "/auth/verify"         "lead-auth-verify"
  add_route "GET"  "/auth/me"             "lead-auth-me"
  # Stripe checkout
  add_route "POST" "/checkout/session"    "lead-checkout-session"
  # Admin
  add_route "GET"  "/admin/snapshot"      "lead-admin-snapshot"
  # Enterprise (Bossware)
  add_route "POST" "/enterprise/org"                 "lead-enterprise-org"
  add_route "GET"  "/enterprise/org"                 "lead-enterprise-org"
  add_route "POST" "/enterprise/org/{id}/invite"     "lead-enterprise-org"
  add_route "GET"  "/enterprise/org/{id}/members"    "lead-enterprise-org"
  add_route "POST" "/enterprise/org/{id}/consent"    "lead-enterprise-org"
  add_route "GET"  "/enterprise/org/{id}/telemetry"  "lead-enterprise-org"
  add_route "POST" "/enterprise/telemetry"           "lead-telemetry-ingest"
  # Firebase auth
  add_route "POST" "/auth/firebase"                  "lead-auth-firebase"
  add_route "POST" "/auth/profile"                   "lead-auth-profile"
  # MyHire applications
  add_route "POST" "/myhire/applications"            "lead-myhire-applications"
  # Skill Check
  add_route "POST" "/skillcheck/create"              "lead-skillcheck"
  add_route "GET"  "/skillcheck/{token}"             "lead-skillcheck"
  add_route "POST" "/skillcheck/{token}/start"       "lead-skillcheck"
  add_route "POST" "/skillcheck/{token}/complete"    "lead-skillcheck"
  # Desktop distribution
  add_route "GET"  "/desktop/update"                  "lead-desktop-update"
  add_route "GET"  "/desktop/download"                "lead-desktop-download"
  # Agents
  add_route "GET"  "/agents"                          "lead-agent-runtime"
  add_route "POST" "/agents/{name}/arm"               "lead-agent-runtime"
  add_route "POST" "/agents/{name}/disarm"            "lead-agent-runtime"
  add_route "POST" "/agents/{name}/run"               "lead-agent-runtime"
  add_route "GET"  "/agents/{name}/runs"              "lead-agent-runtime"
  ok "  routes wired"

  # Stage
  local stage
  stage=$(aws apigatewayv2 get-stages --api-id "$api_id" --region "$REGION" \
    --query "Items[?StageName=='\$default'].StageName | [0]" --output text 2>/dev/null || true)
  if [ -z "$stage" ] || [ "$stage" = "None" ]; then
    aws apigatewayv2 create-stage --api-id "$api_id" --region "$REGION" \
      --stage-name '$default' --auto-deploy >/dev/null
    ok "  stage \$default created"
  fi

  # Custom domain
  local domain_exists
  domain_exists=$(aws apigatewayv2 get-domain-name --domain-name "$API_DOMAIN" --region "$REGION" 2>/dev/null || true)
  if [ -z "$domain_exists" ]; then
    aws apigatewayv2 create-domain-name --region "$REGION" \
      --domain-name "$API_DOMAIN" \
      --domain-name-configurations "CertificateArn=$CERT_ARN,EndpointType=REGIONAL,SecurityPolicy=TLS_1_2" \
      --tags Project=LEAD >/dev/null
    ok "  custom domain $API_DOMAIN created"
  fi

  local mapping
  mapping=$(aws apigatewayv2 get-api-mappings --domain-name "$API_DOMAIN" --region "$REGION" \
    --query "Items[?ApiId=='$api_id'].ApiMappingId | [0]" --output text 2>/dev/null || true)
  if [ -z "$mapping" ] || [ "$mapping" = "None" ]; then
    aws apigatewayv2 create-api-mapping --region "$REGION" \
      --domain-name "$API_DOMAIN" \
      --api-id "$api_id" \
      --stage '$default' >/dev/null
    ok "  mapping $API_DOMAIN → api"
  fi

  # Route53 ALIAS for api domain → APIGW regional endpoint
  local apigw_target apigw_zone
  apigw_target=$(aws apigatewayv2 get-domain-name --domain-name "$API_DOMAIN" --region "$REGION" \
    --query "DomainNameConfigurations[0].ApiGatewayDomainName" --output text)
  apigw_zone=$(aws apigatewayv2 get-domain-name --domain-name "$API_DOMAIN" --region "$REGION" \
    --query "DomainNameConfigurations[0].HostedZoneId" --output text)
  state_set API_REGIONAL_DOMAIN "$apigw_target"

  cat > "$BUILD_DIR/r53-api.json" <<JSON
{ "Comment": "api.cwleaders.com -> APIGW",
  "Changes": [{
    "Action": "UPSERT",
    "ResourceRecordSet": {
      "Name": "${API_DOMAIN}.",
      "Type": "A",
      "AliasTarget": {
        "HostedZoneId": "${apigw_zone}",
        "DNSName": "${apigw_target}",
        "EvaluateTargetHealth": false
      }
    }
  }]
}
JSON
  aws route53 change-resource-record-sets --hosted-zone-id "$HOSTED_ZONE_ID" \
    --change-batch "file://$BUILD_DIR/r53-api.json" >/dev/null
  ok "  Route53 ALIAS $API_DOMAIN → $apigw_target"

  state_set API_URL "https://$API_DOMAIN"
  state_set API_INVOKE_URL "https://${api_id}.execute-api.${REGION}.amazonaws.com"
}

# ---------- 7. UPLOAD SPAs TO S3 ------------------------------------------
sync_spa() {
  local src="$1"; local bucket="$2"
  say "Sync $src → s3://$bucket"
  aws s3 sync "$src/" "s3://$bucket/" \
    --delete \
    --cache-control "public, max-age=300" \
    --exclude "*.html" \
    --exclude "*.json" >/dev/null
  aws s3 sync "$src/" "s3://$bucket/" \
    --cache-control "public, max-age=60, must-revalidate" \
    --content-type "text/html; charset=utf-8" \
    --exclude "*" --include "*.html" >/dev/null
  ok "  synced"
}

deploy_frontend() {
  sync_spa "$ROOT/lead-portal"   "$PORTAL_BUCKET"
  sync_spa "$ROOT/upload-app"    "$UPLOAD_BUCKET"
  sync_spa "$ROOT/download-app"  "$DOWNLOAD_BUCKET"
  sync_spa "$ROOT/myhire-app"    "$MYHIRE_BUCKET"
  sync_spa "$ROOT/studio-app"    "$STUDIO_BUCKET"
}

# ---------- 8. CLOUDFRONT (3 distributions) -------------------------------
ensure_cf_function() {
  local name="lead-clean-urls"
  local code=$(cat <<'JS'
function handler(event) {
  var req = event.request;
  var uri = req.uri;
  // /path/ → /path/index.html  (subdirectory landing pages)
  if (uri.endsWith('/')) {
    req.uri = uri + 'index.html';
    return req;
  }
  // already has extension → leave alone
  if (/\.[a-z0-9]+$/i.test(uri)) return req;
  // bare path like /enterprise → /enterprise.html
  req.uri = uri + '.html';
  return req;
}
JS
  )
  local fn_arn
  fn_arn=$(aws cloudfront list-functions --query "FunctionList.Items[?Name=='$name'].FunctionMetadata.FunctionARN | [0]" --output text 2>/dev/null || true)
  if [ -z "$fn_arn" ] || [ "$fn_arn" = "None" ]; then
    echo "$code" > "$BUILD_DIR/cf-fn.js"
    fn_arn=$(aws cloudfront create-function --name "$name" \
      --function-config "Comment=Clean URL rewriter,Runtime=cloudfront-js-2.0" \
      --function-code "fileb://$BUILD_DIR/cf-fn.js" \
      --query "FunctionSummary.FunctionMetadata.FunctionARN" --output text)
    aws cloudfront publish-function --name "$name" \
      --if-match "$(aws cloudfront describe-function --name "$name" --query "ETag" --output text)" >/dev/null
    ok "  cf-function $name created + published"
  else
    ok "  cf-function $name exists"
  fi
  echo "$fn_arn"
}

ensure_oac() {
  local name="$1"
  local oac_id
  oac_id=$(aws cloudfront list-origin-access-controls \
    --query "OriginAccessControlList.Items[?Name=='$name'].Id | [0]" --output text 2>/dev/null || true)
  if [ -z "$oac_id" ] || [ "$oac_id" = "None" ]; then
    cat > "$BUILD_DIR/oac.json" <<JSON
{ "Name": "$name", "OriginAccessControlOriginType": "s3",
  "SigningBehavior": "always", "SigningProtocol": "sigv4" }
JSON
    oac_id=$(aws cloudfront create-origin-access-control \
      --origin-access-control-config "file://$BUILD_DIR/oac.json" \
      --query "OriginAccessControl.Id" --output text)
  fi
  echo "$oac_id"
}

deploy_distribution() {
  local domain="$1"; local bucket="$2"; local key="$3"
  local cert_arn="${4:-$CERT_ARN}"
  say "CloudFront: $domain"

  local existing
  existing=$(aws cloudfront list-distributions \
    --query "DistributionList.Items[?Aliases.Items && contains(Aliases.Items, '$domain')].Id | [0]" \
    --output text 2>/dev/null || true)
  if [ -n "$existing" ] && [ "$existing" != "None" ]; then
    ok "  distribution exists: $existing"
    state_set "CF_${key}" "$existing"
    local cf_domain
    cf_domain=$(aws cloudfront get-distribution --id "$existing" --query "Distribution.DomainName" --output text)
    state_set "CF_${key}_DOMAIN" "$cf_domain"
    return
  fi

  local oac_id cf_fn_arn
  oac_id=$(ensure_oac "lead-${key}-oac")
  cf_fn_arn=$(ensure_cf_function | tail -1)

  local config_file="$BUILD_DIR/cf-${key}.json"
  cat > "$config_file" <<JSON
{
  "CallerReference": "lead-${key}-$(date +%s)",
  "Aliases": { "Quantity": 1, "Items": ["${domain}"] },
  "DefaultRootObject": "index.html",
  "Origins": {
    "Quantity": 1,
    "Items": [{
      "Id": "s3-${bucket}",
      "DomainName": "${bucket}.s3.${REGION}.amazonaws.com",
      "OriginAccessControlId": "${oac_id}",
      "S3OriginConfig": { "OriginAccessIdentity": "" },
      "ConnectionAttempts": 3,
      "ConnectionTimeout": 10
    }]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "s3-${bucket}",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": {
      "Quantity": 2, "Items": ["GET","HEAD"],
      "CachedMethods": { "Quantity": 2, "Items": ["GET","HEAD"] }
    },
    "Compress": true,
    "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6",
    "ResponseHeadersPolicyId": "67f7725c-6f97-4210-82d7-5512b31e9d03",
    "FunctionAssociations": {
      "Quantity": 1,
      "Items": [{ "EventType": "viewer-request", "FunctionARN": "${cf_fn_arn}" }]
    }
  },
  "CustomErrorResponses": {
    "Quantity": 2,
    "Items": [
      { "ErrorCode": 403, "ResponsePagePath": "/index.html", "ResponseCode": "200", "ErrorCachingMinTTL": 10 },
      { "ErrorCode": 404, "ResponsePagePath": "/index.html", "ResponseCode": "200", "ErrorCachingMinTTL": 10 }
    ]
  },
  "Comment": "LEAD ${key}",
  "Enabled": true,
  "PriceClass": "PriceClass_100",
  "ViewerCertificate": {
    "ACMCertificateArn": "${cert_arn}",
    "SSLSupportMethod": "sni-only",
    "MinimumProtocolVersion": "TLSv1.2_2021",
    "Certificate": "${cert_arn}",
    "CertificateSource": "acm"
  },
  "HttpVersion": "http2and3",
  "IsIPV6Enabled": true
}
JSON

  local result
  result=$(aws cloudfront create-distribution --distribution-config "file://$config_file")
  local dist_id cf_domain
  dist_id=$(echo "$result" | python3 -c "import sys,json;print(json.load(sys.stdin)['Distribution']['Id'])")
  cf_domain=$(echo "$result" | python3 -c "import sys,json;print(json.load(sys.stdin)['Distribution']['DomainName'])")
  ok "  created: $dist_id ($cf_domain)"
  state_set "CF_${key}" "$dist_id"
  state_set "CF_${key}_DOMAIN" "$cf_domain"

  # Bucket policy: allow this CF distribution via OAC
  cat > "$BUILD_DIR/bp-${key}.json" <<JSON
{ "Version": "2012-10-17", "Statement": [{
  "Sid": "AllowCloudFrontReadOAC",
  "Effect": "Allow",
  "Principal": { "Service": "cloudfront.amazonaws.com" },
  "Action": "s3:GetObject",
  "Resource": "arn:aws:s3:::${bucket}/*",
  "Condition": { "StringEquals": {
    "AWS:SourceArn": "arn:aws:cloudfront::${ACCOUNT_ID}:distribution/${dist_id}"
  }}
}]}
JSON
  aws s3api put-bucket-policy --bucket "$bucket" --policy "file://$BUILD_DIR/bp-${key}.json" >/dev/null
  ok "  bucket policy applied"
}

deploy_cloudfront() {
  deploy_distribution "$PORTAL_DOMAIN"   "$PORTAL_BUCKET"   "PORTAL"
  deploy_distribution "$UPLOAD_DOMAIN"   "$UPLOAD_BUCKET"   "UPLOAD"
  deploy_distribution "$DOWNLOAD_DOMAIN" "$DOWNLOAD_BUCKET" "DOWNLOAD"
  # MyHire reuses the existing myhire-only cert that's already in ACM
  deploy_distribution "$MYHIRE_DOMAIN"   "$MYHIRE_BUCKET"   "MYHIRE"   "$MYHIRE_CERT_ARN"
  deploy_distribution "$STUDIO_DOMAIN"   "$STUDIO_BUCKET"   "STUDIO"   "$STUDIO_CERT_ARN"
}

# ---------- 9. ROUTE53 ALIAS RECORDS --------------------------------------
deploy_dns() {
  say "Route53: subdomain ALIAS records"
  for k in PORTAL UPLOAD DOWNLOAD MYHIRE STUDIO; do
    local domain_var="${k}_DOMAIN"
    case "$k" in
      PORTAL)   domain="$PORTAL_DOMAIN";;
      UPLOAD)   domain="$UPLOAD_DOMAIN";;
      DOWNLOAD) domain="$DOWNLOAD_DOMAIN";;
      MYHIRE)   domain="$MYHIRE_DOMAIN";;
      STUDIO)   domain="$STUDIO_DOMAIN";;
    esac
    local cf_domain
    cf_domain=$(state_get "CF_${k}_DOMAIN")
    [ -z "$cf_domain" ] && { warn "  no CF domain for $k, skip"; continue; }
    cat > "$BUILD_DIR/r53-${k}.json" <<JSON
{ "Comment": "LEAD ${domain}",
  "Changes": [{
    "Action": "UPSERT",
    "ResourceRecordSet": {
      "Name": "${domain}.",
      "Type": "A",
      "AliasTarget": {
        "HostedZoneId": "Z2FDTNDATAQYW2",
        "DNSName": "${cf_domain}",
        "EvaluateTargetHealth": false
      }
    }
  }, {
    "Action": "UPSERT",
    "ResourceRecordSet": {
      "Name": "${domain}.",
      "Type": "AAAA",
      "AliasTarget": {
        "HostedZoneId": "Z2FDTNDATAQYW2",
        "DNSName": "${cf_domain}",
        "EvaluateTargetHealth": false
      }
    }
  }]
}
JSON
    aws route53 change-resource-record-sets --hosted-zone-id "$HOSTED_ZONE_ID" \
      --change-batch "file://$BUILD_DIR/r53-${k}.json" >/dev/null
    ok "  ${domain} → ${cf_domain}"
  done
}

# ---------- 10. STATUS ----------------------------------------------------
status() {
  printf "\n\033[1;36m═══ LEAD INFRASTRUCTURE STATE ═══\033[0m\n\n"
  cat "$STATE_FILE" | sort | column -t -s '='
  printf "\n"
  printf "  Portal     : https://%s\n" "$PORTAL_DOMAIN"
  printf "  Upload     : https://%s\n" "$UPLOAD_DOMAIN"
  printf "  Download   : https://%s\n" "$DOWNLOAD_DOMAIN"
  printf "  MyHire     : https://%s\n" "$MYHIRE_DOMAIN"
  printf "  Studio     : https://%s\n" "$STUDIO_DOMAIN"
  printf "  API        : https://%s\n" "$API_DOMAIN"
  printf "\n"
}

invalidate_cdn() {
  for k in PORTAL UPLOAD DOWNLOAD MYHIRE STUDIO; do
    local id
    id=$(state_get "CF_${k}")
    [ -z "$id" ] && continue
    aws cloudfront create-invalidation --distribution-id "$id" --paths "/*" \
      --query "Invalidation.Id" --output text >/dev/null && ok "  invalidated $k ($id)"
  done
}

# ---------- ENTRY ---------------------------------------------------------
attach_cf_function_to_existing() {
  say "Attach clean-URL CF function to existing distributions"
  local fn_arn
  fn_arn=$(ensure_cf_function | tail -1)
  for k in PORTAL UPLOAD DOWNLOAD MYHIRE STUDIO; do
    local id; id=$(state_get "CF_${k}")
    [ -z "$id" ] && continue
    local etag tmp
    tmp="$BUILD_DIR/cf-${k}-current.json"
    aws cloudfront get-distribution-config --id "$id" > "$tmp"
    etag=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['ETag'])" "$tmp")
    python3 - "$tmp" "$fn_arn" <<'PY'
import json, sys
path, arn = sys.argv[1], sys.argv[2]
data = json.load(open(path))
cfg = data['DistributionConfig']
cfg['DefaultCacheBehavior']['FunctionAssociations'] = {
    'Quantity': 1,
    'Items': [{'EventType': 'viewer-request', 'FunctionARN': arn}]
}
json.dump(cfg, open(path + '.cfg', 'w'))
PY
    aws cloudfront update-distribution --id "$id" --if-match "$etag" \
      --distribution-config "file://${tmp}.cfg" >/dev/null && ok "  $k updated"
  done
}

# Attach Lambda invoke permissions for API GW (statement-id sanitized)
add_apigw_permissions() {
  say "Lambda invoke permissions for API Gateway"
  local api_id; api_id=$(state_get API_ID)
  local source_arn="arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${api_id}/*/*"
  for fn_path_pair in \
    "lead-presign-upload:POST-files-presign" \
    "lead-complete-upload:POST-files-complete" \
    "lead-get-file:GET-files-token" \
    "lead-get-file:GET-files-token-dl" \
    "lead-license-validate:POST-license-validate" \
    "lead-stripe-webhook:POST-stripe-webhook" \
    "lead-waitlist:POST-waitlist" \
    "lead-auth-request:POST-auth-request" \
    "lead-auth-verify:POST-auth-verify" \
    "lead-auth-me:GET-auth-me" \
    "lead-checkout-session:POST-checkout-session" \
    "lead-admin-snapshot:GET-admin-snapshot" \
    "lead-enterprise-org:POST-enterprise-org" \
    "lead-enterprise-org:GET-enterprise-org" \
    "lead-enterprise-org:POST-enterprise-org-id-invite" \
    "lead-enterprise-org:GET-enterprise-org-id-members" \
    "lead-enterprise-org:POST-enterprise-org-id-consent" \
    "lead-enterprise-org:GET-enterprise-org-id-telemetry" \
    "lead-telemetry-ingest:POST-enterprise-telemetry" \
    "lead-auth-firebase:POST-auth-firebase" \
    "lead-auth-profile:POST-auth-profile" \
    "lead-myhire-applications:POST-myhire-applications" \
    "lead-skillcheck:POST-skillcheck-create" \
    "lead-skillcheck:GET-skillcheck-token" \
    "lead-skillcheck:POST-skillcheck-token-start" \
    "lead-skillcheck:POST-skillcheck-token-complete" \
    "lead-desktop-update:GET-desktop-update" \
    "lead-desktop-download:GET-desktop-download" \
    "lead-agent-runtime:GET-agents" \
    "lead-agent-runtime:POST-agents-name-arm" \
    "lead-agent-runtime:POST-agents-name-disarm" \
    "lead-agent-runtime:POST-agents-name-run" \
    "lead-agent-runtime:GET-agents-name-runs"; do
    local fn="${fn_path_pair%%:*}"
    local sid="apigw-${fn_path_pair##*:}"
    aws lambda add-permission --region "$REGION" \
      --function-name "$fn" --statement-id "$sid" \
      --action lambda:InvokeFunction \
      --principal apigateway.amazonaws.com \
      --source-arn "$source_arn" >/dev/null 2>&1 || true
  done
  ok "  permissions added/idempotent"
}

deploy_eventbridge() {
  say "EventBridge: hourly agent scheduler"
  local rule_name="lead-agent-scheduler-hourly"
  local rule_arn
  rule_arn=$(aws events describe-rule --name "$rule_name" --query "Arn" --output text 2>/dev/null || true)
  if [ -z "$rule_arn" ] || [ "$rule_arn" = "None" ]; then
    rule_arn=$(aws events put-rule --name "$rule_name" \
      --schedule-expression "rate(1 hour)" \
      --description "Triggers lead-agent-scheduler every hour" \
      --query "RuleArn" --output text)
    ok "  rule created: $rule_arn"
  else
    ok "  rule exists: $rule_arn"
  fi

  # Wire target
  aws events put-targets --rule "$rule_name" \
    --targets "Id=1,Arn=arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:lead-agent-scheduler" >/dev/null
  # Permission for EventBridge to invoke the Lambda
  aws lambda add-permission --region "$REGION" \
    --function-name lead-agent-scheduler \
    --statement-id "eb-${rule_name}" \
    --action lambda:InvokeFunction \
    --principal events.amazonaws.com \
    --source-arn "$rule_arn" 2>/dev/null || true
  ok "  scheduler wired"
}

case "${1:-all}" in
  all)
    deploy_dynamo
    deploy_s3
    deploy_cognito
    deploy_iam
    deploy_lambdas
    deploy_api
    add_apigw_permissions
    deploy_eventbridge
    deploy_frontend
    deploy_cloudfront
    deploy_dns
    attach_cf_function_to_existing
    invalidate_cdn
    status
    ;;
  frontend)   deploy_frontend; invalidate_cdn ;;
  lambdas)    deploy_lambdas; add_apigw_permissions ;;
  events)     deploy_eventbridge ;;
  cf)         deploy_cloudfront; deploy_dns ;;
  cffn)       attach_cf_function_to_existing; invalidate_cdn ;;
  perms)      add_apigw_permissions ;;
  invalidate) invalidate_cdn ;;
  status)     status ;;
  *) echo "usage: $0 [all|frontend|lambdas|cf|cffn|perms|invalidate|status]"; exit 1 ;;
esac
