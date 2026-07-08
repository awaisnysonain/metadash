#!/bin/bash
set -euo pipefail
ENV_FILE=/var/www/html/mern-stack/aws_vendors/.env
read_env() { grep "^$1" "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d ' \r'; }
export AWS_ACCESS_KEY_ID="$(read_env AWS_ACCESS_KEY_ID)"
export AWS_SECRET_ACCESS_KEY="$(read_env AWS_SECRET_ACCESS_KEY)"
export AWS_DEFAULT_REGION=us-east-1

echo "=== Zone delegation nameservers ==="
aws route53 get-hosted-zone --id Z08578753QDQWVEWVDEB6 --query 'DelegationSet.NameServers' --output text

echo "=== All zones in account ==="
aws route53 list-hosted-zones --output table
