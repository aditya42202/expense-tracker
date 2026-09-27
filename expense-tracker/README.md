# Bachelor Expense Tracker

A full-stack expense management project built with Django REST Framework and React.

## Stack
- Frontend: React + Vite + JavaScript + Tailwind CSS + React Router + Axios + Recharts + Lucide
- Backend: Django + Django REST Framework + JWT
- Database: MySQL ready, with SQLite fallback for local development when MySQL is not installed

## Project structure
- `backend/` — Django application
- `frontend/` — Vite React app

## Quick start

### 1. MySQL database creation
If you want to use MySQL, create a database:

```sql
CREATE DATABASE expense_tracker;
```

Then update `backend/.env` with your credentials.

### 2. Backend installation
```bash
cd expense-tracker/backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Environment variables
Create `backend/.env` from the sample:

```env
SECRET_KEY=your-secret-key
DEBUG=True
DB_NAME=
DB_USER=root
DB_PASSWORD=
DB_HOST=localhost
DB_PORT=3306
EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend
```

> Leave `DB_NAME` empty to use the SQLite fallback automatically in local development.
> The console email backend prints verification codes in the backend terminal. For real email, set `EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USE_TLS`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, and `DEFAULT_FROM_EMAIL` in `backend/.env`.

### 4. Django migrations
```bash
python manage.py makemigrations accounts expenses
python manage.py migrate
```

### 5. Create admin user
```bash
python manage.py createsuperuser
```

### 6. Seed demo data
```bash
python manage.py seed_data
```

Demo login:
- Email: `demo@expense.com`
- Password: `demo1234`

### 7. Run backend server
```bash
python manage.py runserver 0.0.0.0:8000
```

### 8. Frontend setup
```bash
cd ../frontend
npm install
npm run dev
```

Visit `http://localhost:5173` to open the app.

### 9. Test login and CRUD operations
- Login with the demo account or create a new user via the registration page.
- Use the dashboard to verify totals and recent transactions.
- Add expense and income records via the API or frontend when connected.

## API base URL
The frontend uses:

```text
http://127.0.0.1:8000/api
```

## Included auth endpoints
- `POST /api/auth/register/`
- `POST /api/auth/verify-otp/`
- `POST /api/auth/resend-otp/`
- `POST /api/auth/login/`
- `POST /api/auth/refresh/`
- `POST /api/auth/logout/`
- `GET /api/auth/profile/`
- `PUT /api/auth/profile/`
- `POST /api/auth/change-password/`

New registrations stay inactive until their six-digit email code is verified. Codes expire after 10 minutes and are limited to five verification attempts. Newly created expenses, income, categories, people, budgets, and savings goals create in-app notifications for the owning account.

## Notes
- JWT is enabled with Django REST Framework Simple JWT.
- All private routes are protected.
- Current database config uses SQLite for this environment because MySQL is not installed locally.
- For production, configure MySQL in the `.env` file and install `mysqlclient`.
