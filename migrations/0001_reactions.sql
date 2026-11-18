-- One emoji per person per moment. "Person" = HMAC of a long-lived cookie id;
-- ip is an HMAC of the client IP, used to cap cookie-clearing and to rate limit.
CREATE TABLE reactions (
  blog       TEXT    NOT NULL,
  moment     TEXT    NOT NULL,
  voter      TEXT    NOT NULL,
  ip         TEXT    NOT NULL,
  emoji      TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (blog, moment, voter)
);
CREATE INDEX reactions_by_moment_time ON reactions (blog, moment, created_at DESC);
CREATE INDEX reactions_by_moment_ip   ON reactions (blog, moment, ip, created_at DESC);
CREATE INDEX reactions_by_ip_time     ON reactions (ip, created_at);
