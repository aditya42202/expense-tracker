-- Pennywise database inspection queries for SQLite.
-- Replace named parameters such as :user_id with values in your SQL client.

-- Show all users (never select password hashes for routine inspection).
SELECT id, name, email, is_active, created_at
FROM users
ORDER BY id;

-- Show all expenses with owner and category.
SELECT e.id, u.email AS user_email, c.name AS category, e.amount, e.description,
       e.notes, e.date, e.payment_method
FROM expenses_expense AS e
JOIN users AS u ON u.id = e.user_id
JOIN expenses_category AS c ON c.id = e.category_id
ORDER BY e.date DESC, e.id DESC;

-- Show all income entries.
SELECT i.id, u.email AS user_email, c.name AS category, i.amount, i.description,
       i.notes, i.date, i.payment_method
FROM expenses_income AS i
JOIN users AS u ON u.id = i.user_id
JOIN expenses_category AS c ON c.id = i.category_id
ORDER BY i.date DESC, i.id DESC;

-- Show categories.
SELECT c.id, u.email AS user_email, c.name, c.type, c.icon
FROM expenses_category AS c
JOIN users AS u ON u.id = c.user_id
ORDER BY u.email, c.type, c.name;

-- Show today's expenses in the SQLite host's local timezone.
SELECT id, user_id, category_id, amount, description, date
FROM expenses_expense
WHERE date = date('now', '+5 hours', '+30 minutes')
ORDER BY id DESC;

-- Show this month's expenses.
SELECT id, user_id, category_id, amount, description, date
FROM expenses_expense
WHERE strftime('%Y-%m', date) = strftime('%Y-%m', 'now', '+5 hours', '+30 minutes')
ORDER BY date DESC, id DESC;

-- Monthly expense summary for one user.
SELECT strftime('%Y-%m', date) AS month, SUM(amount) AS total_expense
FROM expenses_expense
WHERE user_id = :user_id
GROUP BY strftime('%Y-%m', date)
ORDER BY month DESC;

-- Monthly income summary for one user.
SELECT strftime('%Y-%m', date) AS month, SUM(amount) AS total_income
FROM expenses_income
WHERE user_id = :user_id
GROUP BY strftime('%Y-%m', date)
ORDER BY month DESC;

-- Category-wise expense summary for one user.
SELECT c.name AS category, SUM(e.amount) AS total_expense, COUNT(*) AS expense_count
FROM expenses_expense AS e
JOIN expenses_category AS c ON c.id = e.category_id
WHERE e.user_id = :user_id
GROUP BY c.id, c.name
ORDER BY total_expense DESC;

-- User-wise expense summary (administrative inspection).
SELECT u.id, u.email, COALESCE(SUM(e.amount), 0) AS total_expense,
       COUNT(e.id) AS expense_count
FROM users AS u
LEFT JOIN expenses_expense AS e ON e.user_id = u.id
GROUP BY u.id, u.email
ORDER BY total_expense DESC;

-- Highest expenses for one user.
SELECT e.id, c.name AS category, e.amount, e.description, e.date
FROM expenses_expense AS e
JOIN expenses_category AS c ON c.id = e.category_id
WHERE e.user_id = :user_id
ORDER BY e.amount DESC, e.date DESC
LIMIT 10;

-- Latest expenses for one user.
SELECT e.id, c.name AS category, e.amount, e.description, e.date
FROM expenses_expense AS e
JOIN expenses_category AS c ON c.id = e.category_id
WHERE e.user_id = :user_id
ORDER BY e.date DESC, e.created_at DESC
LIMIT 20;

-- Total income for one user.
SELECT COALESCE(SUM(amount), 0) AS total_income
FROM expenses_income
WHERE user_id = :user_id;

-- Total expenses for one user.
SELECT COALESCE(SUM(amount), 0) AS total_expense
FROM expenses_expense
WHERE user_id = :user_id;

-- Remaining balance for one user.
SELECT
  (SELECT COALESCE(SUM(amount), 0) FROM expenses_income WHERE user_id = :user_id)
  - (SELECT COALESCE(SUM(amount), 0) FROM expenses_expense WHERE user_id = :user_id)
  AS remaining_balance;

-- Delete one expense. Verify both IDs before committing; never omit user_id.
DELETE FROM expenses_expense
WHERE id = :expense_id AND user_id = :user_id;

-- Update one expense. Use an owned category_id and verify affected rows.
UPDATE expenses_expense
SET amount = :amount,
    category_id = :category_id,
    description = :description,
    notes = :notes,
    date = :date,
    payment_method = :payment_method,
    updated_at = CURRENT_TIMESTAMP
WHERE id = :expense_id AND user_id = :user_id;

-- Search description, notes, category, or payment method for one user.
SELECT e.id, c.name AS category, e.amount, e.description, e.notes, e.date
FROM expenses_expense AS e
JOIN expenses_category AS c ON c.id = e.category_id
WHERE e.user_id = :user_id
  AND (e.description LIKE '%' || :search || '%'
       OR e.notes LIKE '%' || :search || '%'
       OR c.name LIKE '%' || :search || '%'
       OR e.payment_method LIKE '%' || :search || '%')
ORDER BY e.date DESC;

-- Filter expenses by an inclusive date range.
SELECT id, category_id, amount, description, date
FROM expenses_expense
WHERE user_id = :user_id AND date >= :date_from AND date <= :date_to
ORDER BY date DESC;

-- Filter expenses by category for one user.
SELECT id, amount, description, date
FROM expenses_expense
WHERE user_id = :user_id AND category_id = :category_id
ORDER BY date DESC;