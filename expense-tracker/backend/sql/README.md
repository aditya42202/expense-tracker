# SQLite and PostgreSQL data guide

The Django API is the only application-facing database interface. Local development uses `backend/db.sqlite3`; production uses PostgreSQL selected by `DATABASE_URL`. React and mobile clients must call the HTTPS API and must never connect directly to either database.

## Open SQLite

Install the SQLite command-line tools or use DB Browser for SQLite. In PowerShell, from `expense-tracker/backend`:

```powershell
sqlite3 .\db.sqlite3
```

The file is `backend/db.sqlite3`. Open that file directly in DB Browser for SQLite, then use its **Browse Data** and **Execute SQL** views.

## View tables and schema

At the `sqlite>` prompt:

```sql
.tables
.schema expenses_expense
PRAGMA table_info(expenses_expense);
SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;
```

Common tables include `users` (the project's custom user table), `expenses_category`, `expenses_expense`, `expenses_income`, `expenses_budget`, `expenses_savingsgoal`, and group/notification tables. Django's built-in `auth_*`, `django_*`, and `token_blacklist_*` tables support authentication and migrations.

## Run the saved queries

From the `backend` directory, load the SQL file in the SQLite shell:

```sql
.read sql/queries.sql
```

The examples use SQLite date functions and named placeholders such as `:user_id`. The app uses India Standard Time for current-day/month queries. Replace the placeholders with actual IDs/dates in a GUI, or bind them with SQLite's parameter commands, for example `.parameter set :user_id 1`. The update and delete examples are destructive; first run a matching `SELECT` with the same `user_id` and `expense_id`, then run the mutation and verify the affected row. All mutations are scoped to an owner.

`queries.sql` covers user/category listings, expense and income lists, today's/current-month expenses, monthly and category/user summaries, highest/latest entries, totals/balance, and search/date/category filters. Its `strftime` and `date('now', 'localtime')` expressions are SQLite-specific. In PostgreSQL use `CURRENT_DATE`, `date_trunc('month', date)`, and `to_char(date, 'YYYY-MM')` for equivalent grouping.

## Backup SQLite

Stop the development server before copying the database file, or use SQLite's consistent online backup command. From `backend`:

```powershell
sqlite3 .\db.sqlite3 ".backup 'db-backup.sqlite3'"
```

Keep backups outside source control and verify one by opening it with `sqlite3 db-backup.sqlite3`. Do not overwrite or delete the existing `db.sqlite3` while applying migrations.

## PostgreSQL in production

Create a managed PostgreSQL database with your host and set `DATABASE_URL` in the backend's environment/secret manager, for example:

```text
postgresql://<user>:<password>@<host>:5432/<database>?sslmode=require
```

Do not commit the URL or place it in a `VITE_*` frontend variable. Set `DEBUG=False`, `SECRET_KEY`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, and `CSRF_TRUSTED_ORIGINS` for the deployed service. Install backend requirements, then run `python manage.py migrate` as a release/pre-deploy step. The PostgreSQL driver is included in `requirements.txt`.

To inspect a remote database, use the provider's protected console or a local `psql` client configured with the provider-issued connection URL. Apply the PostgreSQL equivalents of the read-only reports; do not run SQLite-specific SQL unchanged. Back up production using provider-managed snapshots or `pg_dump`, and test restoration separately. Existing SQLite data is not automatically migrated to PostgreSQL.