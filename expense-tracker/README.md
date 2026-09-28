# Pennywise Expense Tracker

Pennywise is a responsive React/Vite client backed by a Django REST API. SQLite is used for local development; PostgreSQL is configured through `DATABASE_URL` for production. Web and future mobile clients communicate only with the HTTPS API, never directly with the database.

## Project layout

- `backend/` Django REST Framework API, accounts, expense models, migrations, and database tools
- `frontend/` React/Vite application
- `backend/db.sqlite3` local development database (existing data is preserved)

## Local Windows setup

From the `expense-tracker` directory, create `backend/.env` from `backend/.env.example` and replace `SECRET_KEY` with a random value. The defaults use SQLite and the local Vite origins.

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python manage.py check
python manage.py makemigrations
python manage.py migrate
python manage.py runserver 127.0.0.1:8000
```

In a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open the Vite URL printed in the terminal, normally `http://localhost:5173`. New accounts require email verification; the local console email backend prints the OTP in the Django terminal. Use SMTP environment variables for real email delivery.

For a local frontend API override, copy `frontend/.env.example` to `frontend/.env.local`. Set `VITE_API_BASE_URL` to the API root, normally `http://127.0.0.1:8000/api`.

## Database

The development default is `backend/db.sqlite3`. `DATABASE_URL=sqlite:///db.sqlite3` uses that file when Django runs from `backend/`. For inspection, table names, queries, and backup instructions, see [backend/sql/README.md](backend/sql/README.md) and [backend/sql/queries.sql](backend/sql/queries.sql).

Production requires a provider-issued PostgreSQL connection URL in `DATABASE_URL`; Django rejects a missing or SQLite production URL rather than silently storing data on an ephemeral filesystem. Do not put credentials in source control or frontend variables. Run migrations during deployment. Existing SQLite data is not automatically copied to PostgreSQL; use a planned export/import when promoting real data.

## API

All private endpoints require `Authorization: Bearer <access-token>`. Sign-in requires a valid password followed by a six-digit code sent to the account email; the API issues access/refresh JWTs only after code verification. Login codes expire in 10 minutes, allow five attempts, and can be resent after the cooldown. JWT access tokens expire after one day and refresh tokens after seven days. The API scopes personal records to the authenticated account.

- Authentication: `POST /api/auth/register/`, `/login/`, `/login/verify-otp/`, `/login/resend-otp/`, `/logout/`, `/refresh/`, `/verify-otp/`, `/resend-otp/`
- Current user/profile: `GET /api/auth/profile/`, `PUT /api/auth/profile/`, `GET /api/profile/`
- Expenses: `GET/POST /api/expenses/`, `GET/PUT/PATCH/DELETE /api/expenses/{id}/`
- Income: `GET/POST /api/income/`, `GET/PUT/PATCH/DELETE /api/income/{id}/`
- Categories: `GET/POST /api/categories/`, standard detail update/delete routes
- Dashboard: `GET /api/dashboard/`, `GET /api/dashboard/reports/`, `/api/dashboard/monthly/?months=12`, `/api/dashboard/categories/?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD`
- Health: public `GET /api/health/` returns `{"status":"ok"}`

Expense and income lists support `search`, `category`, `date_from`, and `date_to` query parameters. Example: `/api/expenses/?search=market&category=3&date_from=2026-01-01&date_to=2026-01-31`. The API returns JSON arrays for lists to preserve the existing client contract.

## Production deployment

The repository includes a Render Blueprint at the Git root ([`render.yaml`](../render.yaml)) and Vercel SPA routing in `frontend/vercel.json`. Deploy from the connected GitHub repository:

1. In Render, create a new Blueprint from this repository and approve the `pennywise-api` Starter web service plus Basic PostgreSQL database. These are paid Render plans. The Blueprint installs `backend/requirements.txt`, applies migrations and collects static assets before deploy, and uses `/api/health/` as its health check.
2. The Render Blueprint allows both the previous Vercel origin and `https://wise-expense-tracker-ten.vercel.app` through `CORS_ALLOWED_ORIGINS` and `CSRF_TRUSTED_ORIGINS`. Django includes Render's automatically supplied `RENDER_EXTERNAL_HOSTNAME` in `ALLOWED_HOSTS`. Add SMTP `EMAIL_HOST`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, and `DEFAULT_FROM_EMAIL` in Render's environment for verification-code delivery.
3. Import the same repository into Vercel and set the Root Directory to `expense-tracker/frontend`. Set the Vercel build environment variable `VITE_API_BASE_URL` to `https://expense-tracker-l07o.onrender.com/api` for Production (and Preview only if those deployments should use this API). `frontend/.env.production` provides the same build default; Vercel uses `npm ci`, `npm run build`, `dist`, and rewrites client routes to `index.html`.
4. Verify `https://expense-tracker-l07o.onrender.com/api/health/` returns `{"status":"ok"}`, then test sign-in and confirm the login OTP arrives by email.

Set backend environment variables in the host dashboard or secret manager:

- `SECRET_KEY`: a unique, high-entropy value
- `DEBUG=False`
- `ALLOWED_HOSTS`: comma-separated backend hostnames, without schemes
- `CORS_ALLOWED_ORIGINS`: exact HTTPS frontend origins
- `CSRF_TRUSTED_ORIGINS`: exact trusted HTTPS origins
- `DATABASE_URL`: provider-issued PostgreSQL URL
- SMTP settings for account verification email

Install `backend/requirements.txt`, then run `python manage.py migrate` and `python manage.py collectstatic --noinput`. Start the WSGI app on Linux hosts with `gunicorn config.wsgi:application --bind 0.0.0.0:$PORT` from `backend/`. The settings enable PostgreSQL SSL in production, HTTPS redirects, secure session/CSRF cookies, proxy HTTPS recognition, and WhiteNoise static serving. Terminate HTTPS at the platform or reverse proxy.

For Railway/VPS, configure the same environment values and commands in the service settings. Run database migrations as a release/pre-deploy command. Configure a persistent PostgreSQL service and back it up using the provider's managed backup process. Keep frontend and API origins restricted to the deployed domains.

Build the frontend with `npm ci && npm run build` from `frontend/`, setting `VITE_API_BASE_URL` at build time to `https://your-api-domain.example/api`. Deploy `frontend/dist` to a static host with SPA fallback/rewrite to `index.html`; allow browser requests to the API origin via the backend CORS allowlist. The Vite variable is public configuration, so never place secrets in `VITE_*` variables.

## Mobile clients

React Native, Flutter, and other clients use the same HTTPS REST API and JSON payloads. Register/login, store JWTs using the platform's secure storage, send the access token as a Bearer header, refresh before expiry, and call logout with the refresh token. Scope is enforced by the API user, and no mobile client should connect directly to SQLite or PostgreSQL.

## Verification

```powershell
cd backend
python manage.py check
python manage.py makemigrations --check --dry-run
python manage.py migrate
python manage.py test accounts expenses
cd ..\frontend
npm run build
```
