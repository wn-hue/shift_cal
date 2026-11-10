CREATE TABLE IF NOT EXISTS local_food_votes (
  week TEXT NOT NULL,
  region TEXT NOT NULL,
  occasion TEXT NOT NULL,
  place_id TEXT NOT NULL,
  voter TEXT NOT NULL,
  value INTEGER NOT NULL CHECK (value IN (-1, 1)),
  PRIMARY KEY (week, region, occasion, place_id, voter)
);
CREATE INDEX IF NOT EXISTS local_food_votes_voter
  ON local_food_votes (week, region, occasion, voter);
