#!/bin/bash
set -euo pipefail
ENV_FILE=/var/www/html/mern-stack/aws_vendors/.env
read_env() { grep "^$1" "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d ' \r'; }
export AWS_ACCESS_KEY_ID="$(read_env AWS_ACCESS_KEY_ID)"
export AWS_SECRET_ACCESS_KEY="$(read_env AWS_SECRET_ACCESS_KEY)"
export AWS_DEFAULT_REGION=us-east-1

echo "=== All hosted zones matching nysonik ==="
aws route53 list-hosted-zones-by-name --dns-name nysonik.com --output table

echo "=== All meta-dashboard records in zone ==="
aws route53 list-resource-record-sets --hosted-zone-id Z08578753QDQWVEWVDEB6 --output json \
  | python3 -c "import sys,json; r=json.load(sys.stdin)['ResourceRecordSets'];
[print(x) for x in r if 'meta-dashboard' in x.get('Name','')]"

echo "=== NS for nysonik.com ==="
dig +short NS nysonik.com
