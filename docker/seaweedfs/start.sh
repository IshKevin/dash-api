#!/bin/sh
# Starts an all-in-one SeaweedFS node (master + volume + filer + S3 gateway).
# S3 credentials come from S3_ACCESS_KEY / S3_SECRET_KEY; there is NO anonymous
# identity, so every object is private. Public images are streamed through the
# API (GET /api/files/public/...), never directly from this container.
set -e

: "${S3_ACCESS_KEY:?S3_ACCESS_KEY is required}"
: "${S3_SECRET_KEY:?S3_SECRET_KEY is required}"

mkdir -p /etc/seaweedfs /data
cat > /etc/seaweedfs/s3.json <<JSON
{
  "identities": [
    {
      "name": "dash-api",
      "credentials": [{ "accessKey": "${S3_ACCESS_KEY}", "secretKey": "${S3_SECRET_KEY}" }],
      "actions": ["Admin", "Read", "List", "Tagging", "Write"]
    }
  ]
}
JSON

exec /usr/bin/weed -logtostderr=true server \
  -ip="${SEAWEED_ADVERTISE_IP:-127.0.0.1}" -ip.bind=0.0.0.0 \
  -dir=/data \
  -volume.max="${SEAWEED_VOLUME_MAX:-0}" \
  -master.volumeSizeLimitMB="${SEAWEED_VOLUME_SIZE_MB:-1024}" \
  -s3 -s3.port=8333 -s3.config=/etc/seaweedfs/s3.json
