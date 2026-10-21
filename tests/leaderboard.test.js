import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LocalRepository, LEADERBOARD_KEY, normalizeNickname } from '../src/storage/localRepository.js';

const key = 'silhouette:easy:v1';
const result = (id, score, extra = {}) => ({ id, cleared: true, score, accuracy: 0.98, maxCombo: 100, rank: 'S', playedAt: '2026-10-20T12:00:00.000Z', ...extra });
function repository() {
  const values = new Map();
  const storage = { getItem: (name) => values.get(name) ?? null, setItem: (name, value) => values.set(name, value) };
  return { repo: new LocalRepository(storage), values, storage };
}

test('rankings are ordered by score and isolated by difficulty', () => {
  const { repo } = repository();
  repo.submitRanking(key, 'Alpha', result('1', 100));
  repo.submitRanking(key, 'Beta', result('2', 300));
  repo.submitRanking('silhouette:hard:v1', 'Gamma', result('3', 1000));
  assert.deepEqual(repo.getLeaderboard(key).map((entry) => entry.nickname), ['Beta', 'Alpha']);
  assert.equal(repo.getLeaderboard('silhouette:hard:v1').length, 1);
});

test('one nickname keeps its best score and a run cannot be submitted twice', () => {
  const { repo } = repository();
  repo.submitRanking(key, 'Alpha', result('1', 300));
  assert.equal(repo.submitRanking(key, 'alpha', result('2', 100)).updated, false);
  repo.submitRanking(key, 'ALPHA', result('3', 500));
  assert.equal(repo.submitRanking(key, 'Another', result('3', 500)).updated, false);
  assert.equal(repo.getLeaderboard(key).length, 1);
  assert.equal(repo.getLeaderboard(key)[0].score, 500);
});

test('ties use accuracy, combo, and earlier play time', () => {
  const { repo } = repository();
  repo.submitRanking(key, 'Low', result('1', 100, { accuracy: 0.9 }));
  repo.submitRanking(key, 'Later', result('2', 100, { playedAt: '2026-10-21T00:00:00Z' }));
  repo.submitRanking(key, 'Earlier', result('3', 100));
  assert.deepEqual(repo.getLeaderboard(key).map((entry) => entry.nickname), ['Earlier', 'Later', 'Low']);
});

test('nicknames are normalized and empty names, failed plays and invalid scores are rejected', () => {
  const { repo } = repository();
  assert.equal(normalizeNickname('  Ａ\u200b  B  '), 'A B');
  assert.equal(Array.from(normalizeNickname('가'.repeat(20))).length, 16);
  assert.throws(() => repo.submitRanking(key, ' ', result('1', 100)), /NICKNAME_REQUIRED/);
  assert.throws(() => repo.submitRanking(key, 'Name', result('1', 100, { cleared: false })), /CLEARED_RESULT_REQUIRED/);
  assert.throws(() => repo.submitRanking(key, 'Name', result('1', NaN)), /CLEARED_RESULT_REQUIRED/);
});

test('records and last nickname survive repository reload', () => {
  const { repo, storage } = repository();
  repo.submitRanking(key, '리듬', result('1', 300));
  const reload = new LocalRepository(storage);
  assert.equal(reload.loadNickname(), '리듬');
  assert.equal(reload.getLeaderboard(key)[0].score, 300);
});

test('corrupt storage is recoverable and malformed entries are ignored', () => {
  const { repo, values } = repository();
  for (const invalid of ['{', 'null', '[]']) {
    values.set(LEADERBOARD_KEY, invalid);
    assert.deepEqual(repo.getLeaderboard(key), []);
  }
  values.set(LEADERBOARD_KEY, JSON.stringify({ [key]: [null, { score: 50 }] }));
  assert.deepEqual(repo.getLeaderboard(key), []);
  assert.equal(repo.submitRanking(key, 'Name', result('1', 300)).updated, true);
});

test('storage rejection preserves session records even when old storage is readable', () => {
  const { storage, values } = repository();
  values.set(LEADERBOARD_KEY, '{}');
  storage.setItem = () => { throw new Error('quota'); };
  const repo = new LocalRepository(storage);
  assert.equal(repo.submitRanking(key, 'Name', result('1', 300)).persistent, false);
  assert.equal(repo.getLeaderboard(key)[0].score, 300);
});

test('leaderboard is capped at 100 records', () => {
  const { repo } = repository();
  for (let index = 0; index < 105; index += 1) repo.submitRanking(key, `Player ${index}`, result(String(index), index));
  assert.equal(repo.getLeaderboard(key).length, 100);
  assert.equal(repo.getLeaderboard(key)[0].score, 104);
});