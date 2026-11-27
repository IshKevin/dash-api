#!/bin/sh
set -e

# Inside a container "localhost" is the container itself, never the database.
# Fail fast with a clear message instead of a P1001 crash loop.
case "${DATABASE_URL:-}" in
  "")
    echo "ERROR: DATABASE_URL is not set." >&2
    exit 1 ;;
  *@localhost:*|*@localhost/*|*@127.0.0.1:*|*@127.0.0.1/*)
    if [ "${ALLOW_LOCALHOST_DB:-false}" != "true" ]; then
      echo "ERROR: DATABASE_URL points to localhost, which inside this container is not the database." >&2
      echo "       Use the database's internal hostname (e.g. the Coolify Postgres 'Internal URL', or 'postgres' in docker compose)." >&2
      echo "       Set ALLOW_LOCALHOST_DB=true to override (e.g. --network host)." >&2
      exit 1
    fi ;;
esac

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
