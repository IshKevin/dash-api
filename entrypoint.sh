#!/bin/sh
set -e

echo "Running database migrations..."
npx prisma migrate deploy

# Demo accounts have publicly known passwords (see README) — only seed them
# when explicitly asked (local testing / staging), never by default.
if [ "${SEED_DEMO_DATA:-false}" = "true" ]; then
  echo "Seeding demo data (SEED_DEMO_DATA=true)..."
  node dist/src/scripts/seed.js || echo "Seeding failed, continuing startup anyway"
else
  echo "Skipping demo data (set SEED_DEMO_DATA=true to seed demo accounts)"
fi

echo "Starting server..."
exec node dist/src/server.js
