-- Enable the new writer only after verifying the final frozen source snapshot.
CREATE TABLE IF NOT EXISTS storage_activation (
  id INTEGER PRIMARY KEY CHECK (id = 1)
);
