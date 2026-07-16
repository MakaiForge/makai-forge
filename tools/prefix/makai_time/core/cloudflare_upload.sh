#!/bin/bash
# Upload do Makai Runtime 1.0 para Cloudflare R2
# Pré-requisito: instalar aws-cli e configurar:
#   aws configure  (Access Key ID + Secret Access Key do R2)
#   --endpoint-url = https://<accountid>.r2.cloudflarestorage.com

set -e

R2_BUCKET="makai-runtime"
R2_ENDPOINT="https://ACCOUNT_ID.r2.cloudflarestorage.com"
TARBALL="/home/cas/Desktop/makai-runtime-1.0.tar.gz"

echo "Uploading makai-runtime-1.0.tar.gz to Cloudflare R2..."
aws s3 cp "$TARBALL" "s3://$R2_BUCKET/makai-runtime-1.0.tar.gz" \
  --endpoint-url "$R2_ENDPOINT" \
  --acl public-read

echo "Done!"
echo "URL: https://$R2_BUCKET.$R2_ENDPOINT/makai-runtime-1.0.tar.gz"
