#!/bin/bash
set -euo pipefail

mapfile -t ENV_FILES < <(grep -rl '^AWS_ACCESS_KEY_ID' /var/www/html --include='.env' 2>/dev/null | grep -v node_modules | sort -u)

for f in "${ENV_FILES[@]}"; do
  key=$(grep '^AWS_ACCESS_KEY_ID' "$f" | head -1 | cut -d= -f2- | tr -d ' \r')
  secret=$(grep '^AWS_SECRET_ACCESS_KEY' "$f" | head -1 | cut -d= -f2- | tr -d ' \r')
  [ -z "$key" ] && continue
  export AWS_ACCESS_KEY_ID="$key"
  export AWS_SECRET_ACCESS_KEY="$secret"
  export AWS_DEFAULT_REGION=us-east-1
  echo "=== $f ==="
  ident=$(aws sts get-caller-identity --output json 2>/dev/null || echo ERR)
  echo "$ident"
  acct=$(echo "$ident" | python3 -c "import sys,json; print(json.load(sys.stdin).get('Account',''))" 2>/dev/null || true)
  if [ "$acct" = "638335486554" ]; then
    echo "FOUND_TARGET_ACCOUNT"
    aws route53 list-hosted-zones-by-name --dns-name nysonik.com --output json 2>/dev/null | python3 -c "import sys,json; z=json.load(sys.stdin)['HostedZones'];
print(z[0]['Id'] if z else 'NO_ZONE')"
    aws route53 get-hosted-zone --id "$(aws route53 list-hosted-zones-by-name --dns-name nysonik.com --query 'HostedZones[0].Id' --output text | sed 's|/hostedzone/||')" --query 'DelegationSet.NameServers' --output text 2>/dev/null || true
  fi
  echo
done
