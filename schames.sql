-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Categories Table
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    icon TEXT DEFAULT '📊',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Monthly Budgets Table
CREATE TABLE IF NOT EXISTS monthly_budgets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
    period_key TEXT NOT NULL,
    planned_amount NUMERIC DEFAULT 0,
    actual_amount NUMERIC DEFAULT 0,
    UNIQUE(category_id, period_key)
);

-- 3. Transactions Table
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL,
    note TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Settings Table
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Enable RLS and create permissive policies for anonymous API keys
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public full access categories" ON categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access monthly_budgets" ON monthly_budgets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access transactions" ON transactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access settings" ON settings FOR ALL USING (true) WITH CHECK (true);

-- Insert Default Cycle Start Day
INSERT INTO settings (key, value) VALUES ('cycle_day', '10') ON CONFLICT (key) DO NOTHING;