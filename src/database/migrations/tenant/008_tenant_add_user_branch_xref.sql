/* 008 - Add user_branch_xref table for multi-branch user assignments */

CREATE TABLE IF NOT EXISTS user_branch_xref (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  branch_id INTEGER NOT NULL,
  is_primary BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  assigned_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_user_branch_xref_user ON user_branch_xref(user_id);
CREATE INDEX IF NOT EXISTS idx_user_branch_xref_branch ON user_branch_xref(branch_id);
