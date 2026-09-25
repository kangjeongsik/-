# V25.9.7 PostgreSQL test deployment

DATABASE_URL set: PostgreSQL storage for settings, sales and results. Missing: local JSON for development. DB failure: fail closed, no fallback to ephemeral JSON. Startup creates kiosk_data table. Health includes storage. No automatic migration of previous local JSON. Existing test records in old Render ephemeral filesystem are not imported. Payment remains mock. Do not publish for paid customers.

Upload changed server/server.js, package.json, README-V25.9.7-DB.md to repository at corresponding paths. Never upload secrets or JSON data. Render auto-deploy; verify /api/health has storage: postgres.
