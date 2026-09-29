// Calendar dates must leave the database as plain 'YYYY-MM-DD' text, whatever
// time zone the server runs in. Before this was fixed at the connection, the
// driver turned a DATE into midnight on the server's clock, so a target date of
// 2026-12-01 came back as "2026-11-30T20:00:00.000Z" on Oman time.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { pool } from './pool.js';

const ZONES = ['Asia/Muscat', 'UTC', 'America/Los_Angeles', 'Pacific/Kiritimati'];
const originalTz = process.env.TZ;

after(async () => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
  await pool.end();
});

for (const zone of ZONES) {
  test(`a DATE comes back as the same plain day on ${zone} time`, async () => {
    process.env.TZ = zone;
    // No ::text cast on purpose: this is the query a future route might write.
    const { rows } = await pool.query(
      `SELECT '2026-12-01'::date AS target, '2026-01-01'::date AS new_year, '2028-02-29'::date AS leap`
    );
    assert.equal(rows[0].target, '2026-12-01');
    assert.equal(rows[0].new_year, '2026-01-01');
    assert.equal(rows[0].leap, '2028-02-29');
    // And it survives being sent as JSON unchanged.
    assert.equal(JSON.parse(JSON.stringify(rows[0])).target, '2026-12-01');
  });
}

test('a missing DATE stays empty rather than becoming a made-up day', async () => {
  const { rows } = await pool.query('SELECT NULL::date AS nothing');
  assert.equal(rows[0].nothing, null);
});
