CREATE TABLE payment_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    coach_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    year SMALLINT NOT NULL,
    month SMALLINT NOT NULL CHECK (month >= 1 AND month <= 12),
    amount NUMERIC(10,2) NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'overdue', 'waived')),
    paid_at TIMESTAMPTZ,
    payment_method TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(coach_id, client_id, year, month)
);

-- RLS
ALTER TABLE payment_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can view their payment records"
  ON payment_records
  FOR SELECT
  USING (is_coach_member(coach_id));

CREATE POLICY "Coaches can insert their payment records"
  ON payment_records
  FOR INSERT
  WITH CHECK (is_coach_member(coach_id));

CREATE POLICY "Coaches can update their payment records"
  ON payment_records
  FOR UPDATE
  USING (is_coach_member(coach_id));

CREATE POLICY "Coaches can delete their payment records"
  ON payment_records
  FOR DELETE
  USING (is_coach_member(coach_id));

-- Trigger for updated_at
CREATE TRIGGER handle_payment_records_updated_at BEFORE UPDATE ON payment_records FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

