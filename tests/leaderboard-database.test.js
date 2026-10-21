import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('PostgreSQL migration, atomic best scores, isolation, idempotency, permissions and rate limit', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
    const migration = await readFile(new URL('../database/leaderboard.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    await db.exec(migration);
    const submit = async (nickname, score, options = {}) => {
      const response = await db.query('select public.rhythm_submit_leaderboard($1,$2,$3,$4,$5,$6,$7,$8) as result', [
        options.board ?? 'easy', nickname, options.id ?? randomUUID(), score, options.accuracy ?? 0.98, options.combo ?? 100, 'S', options.hash ?? 'a'.repeat(64),
      ]);
      return response.rows[0].result;
    };
    const firstId = randomUUID();
    const first = await submit('Alpha', 100, { id: firstId });
    assert.equal(first.updated, true);
    assert.equal(first.entries[0].score, 100);
    assert.equal(typeof first.entries[0].playedAt, 'string');
    assert.equal((await submit('alpha', 90)).updated, false);
    assert.equal((await submit('ALPHA', 200)).updated, true);
    const betaId = randomUUID();
    await submit('Beta', 300, { id: betaId });
    assert.equal((await submit('Beta', 300, { id: betaId })).updated, false);
    await assert.rejects(submit('Other', 300, { id: betaId }), /RUN_ALREADY_SUBMITTED/);
    const hard = await submit('Gamma', 500, { board: 'hard' });
    assert.equal(hard.entries.length, 1);
    const ordered = await db.query("select public.rhythm_get_leaderboard('easy') as entries");
    assert.deepEqual(ordered.rows[0].entries.map((entry) => entry.nickname), ['Beta', 'ALPHA']);
    await submit('ALPHA', 200, { accuracy: 0.99 });
    const improved = await submit('ALPHA', 200, { accuracy: 0.99, combo: 150 });
    assert.equal(improved.entries[1].maxCombo, 150);
    for (let index = 0; index < 10; index += 1) await submit(`Rate ${index}`, 1, { board: 'rate', hash: 'b'.repeat(64) });
    await assert.rejects(submit('Blocked', 1, { board: 'rate', hash: 'b'.repeat(64) }), /RATE_LIMITED/);
    await db.exec("update public.rhythm_submission_limits set window_start = window_start - interval '2 minutes' where client_hash = repeat('b',64)");
    assert.equal((await submit('Allowed', 2, { board: 'rate', hash: 'b'.repeat(64) })).updated, true);
    for (let index = 0; index < 105; index += 1) await submit(`Top ${index}`, index, { board: 'top', hash: index.toString(16).padStart(64, '0') });
    const top = await db.query("select public.rhythm_get_leaderboard('top') as entries");
    assert.equal(top.rows[0].entries.length, 100);
    assert.equal(top.rows[0].entries[0].score, 104);
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from public.rhythm_leaderboard_records'), /permission denied/);
    await assert.rejects(db.query("select public.rhythm_get_leaderboard('easy')"), /permission denied/);
    await db.exec('reset role; set role service_role');
    assert.equal((await db.query("select public.rhythm_get_leaderboard('easy') as entries")).rows[0].entries.length, 2);
  } finally { await db.close(); }
});