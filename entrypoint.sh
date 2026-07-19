#!/bin/sh
set -e

echo "Running database migrations..."
npx prisma migrate deploy

echo "Seeding demo accounts (idempotent, skips if already present)..."
node dist/src/scripts/seed.js || echo "Seeding failed, continuing startup anyway"

echo "Starting server..."
exec node dist/src/server.js
