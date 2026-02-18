#!/bin/bash
# Railway startup script - sets env vars that Railway v2 fails to inject

export FLASK_ENV="${FLASK_ENV:-production}"
export SECRET_KEY="${SECRET_KEY:-shalaby-verse-prod-2026-secret}"
export JWT_SECRET_KEY="${JWT_SECRET_KEY:-Zo2lot@123}"

# PostgreSQL - use Railway's reference or fallback
export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:DObGOsFgNfQMSYCUOoqRbdFPvtbtrVVT@trolley.proxy.rlwy.net:11793/railway}"

# 100ms
export HMS_ACCESS_KEY="${HMS_ACCESS_KEY:-699560b56a127e1cf125424b}"
export HMS_SECRET="${HMS_SECRET:-Wx_liU-w0p4DGQqadhzofpdpRQFu749CDpZ3Xxu2CfzXEjpmhxrLJj9DsWe6jAql-zyOvMVQieHyO5oclftaRblXCQR4F2RWoRTrT0RFsdhoLQn651yaEjM5y01fPHxj5SJnaF_t8hrbDNKDrVLQC2Lnuk7wlkRJaYBCLyWw3P0=}"
export HMS_TEMPLATE_ID="${HMS_TEMPLATE_ID:-699560eb6236da36a7d8b3da}"

echo "[START] DATABASE_URL set=${DATABASE_URL:+yes}"
echo "[START] FLASK_ENV=$FLASK_ENV"

exec gunicorn --worker-class gevent -w 1 --bind 0.0.0.0:${PORT:-8080} run:app
