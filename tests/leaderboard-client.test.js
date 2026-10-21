import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OnlineLeaderboardRepository } from '../src/storage/leaderboardRepository.js';
import { LocalRepository, NICKNAME_KEY } from '../src/storage/localRepository.js';

function client(fetcher) {
  const values = new Map();
  const local = new LocalRepository({ getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) });
  return { repo: new OnlineLeaderboardRepository(local, fetcher), values };
}

test('online boards are fetched fresh by difficulty without local ranking fallback', async () => {
  const requests = [];
  const { repo } = client(async (url, options) => { requests.push({ url, options }); return Response.json({ entries: [] }); });
  await repo.getLeaderboard('song:1:5');
  await repo.getLeaderboard('song:2:5');
  assert.match(requests[0].url, /song%3A1%3A5/);
  assert.match(requests[1].url, /song%3A2%3A5/);
  assert.equal(requests[0].options.cache, 'no-store');
});

test('nickname is remembered only after confirmed database save', async () => {
  let body;
  const { repo, values } = client(async (url, options) => { body = JSON.parse(options.body); return Response.json({ entries: [], updated: true, persistent: true }); });
  await repo.submitRanking('song:1:5', '  Name  ', { id: 'run' });
  assert.equal(body.nickname, 'Name');
  assert.equal(values.get(NICKNAME_KEY), 'Name');
});

test('database failures and invalid responses reject instead of displaying saved', async () => {
  const { repo, values } = client(async () => Response.json({ error: 'DB not configured' }, { status: 503 }));
  await assert.rejects(repo.submitRanking('key', 'Name', {}), /DB not configured/);
  assert.equal(values.has(NICKNAME_KEY), false);
  const invalid = client(async () => Response.json({ entries: [], updated: true, persistent: false }));
  await assert.rejects(invalid.repo.submitRanking('key', 'Name', {}), /DB 저장 결과/);
  const network = client(async () => { throw new Error('offline'); });
  await assert.rejects(network.repo.getLeaderboard('key'), /연결하지/);
});