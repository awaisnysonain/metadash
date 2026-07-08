#!/bin/bash
set -euo pipefail

ENV_FILE="$1"
NEW_IP=52.77.228.212
DOMAIN=meta-dashboard.nysonik.com

read_env() {
  local key="$1"
  grep "^${key}" "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d ' \r'
}

export AWS_ACCESS_KEY_ID="$(read_env AWS_ACCESS_KEY_ID)"
export AWS_SECRET_ACCESS_KEY="$(read_env AWS_SECRET_ACCESS_KEY)"
export AWS_DEFAULT_REGION=us-east-1

echo "Using env: $ENV_FILE"
aws sts get-caller-identity

ZONE_ID=$(aws route53 list-hosted-zones-by-name --dns-name nysonik.com --query 'HostedZones[0].Id' --output text | sed 's|/hostedzone/||')
echo "Hosted zone: $ZONE_ID"

CHANGE_BATCH=$(cat <<EOF
{
  "Comment": "MetaDash migration to $NEW_IP",
  "Changes": [
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "$DOMAIN",
        "Type": "A",
        "TTL": 300,
        "ResourceRecords": [{"Value": "$NEW_IP"}]
      }
    },
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "www.$DOMAIN",
        "Type": "A",
        "TTL": 300,
        "ResourceRecords": [{"Value": "$NEW_IP"}]
      }
    }
  ]
}
EOF
)

CHANGE_ID=$(aws route53 change-resource-record-sets \
  --hosted-zone-id "$ZONE_ID" \
  --change-batch "$CHANGE_BATCH" \
  --query 'ChangeInfo.Id' --output text)

echo "Change submitted: $CHANGE_ID"
aws route53 get-change --id "$CHANGE_ID" --query 'ChangeInfo.Status' --output text
echo DNS_OK
