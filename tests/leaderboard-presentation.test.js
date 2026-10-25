import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LeaderboardPresentation } from '../src/ui/leaderboardPresentation.js';

class Node {
 constructor() { this.children=[]; this.textContent=''; }
 append(...nodes) { this.children.push(...nodes); }
 setAttribute() {}
}
function text(node) { return [node.textContent,...node.children.map(text)].join(' '); }

test('result summary shows the current run instead of a higher browser best', () => {
 const original=globalThis.document;
 globalThis.document={createElement:()=>new Node()};
 try {
  const presenter=Object.create(LeaderboardPresentation.prototype);
  presenter.repository={getBestResult:()=>({score:860856,rank:'S',accuracy:0.9811,maxCombo:224,cleared:true})};
  presenter.song={id:'song'}; presenter.rulesetVersion=6;
  const run={score:324297,rank:'A',accuracy:0.9375,maxCombo:86,cleared:true};
  const output=text(presenter.createPersonalBest({label:'Normal',beatmapId:1},run));
  assert.match(output,/이번 플레이/);
  for (const value of ['324,297','93.75%','86x']) assert.ok(output.includes(value));
  assert.ok(!output.includes('860,856'));
  const standalone=text(presenter.createPersonalBest({label:'Normal',beatmapId:1}));
  assert.match(standalone,/내 최고 기록/);
  assert.match(standalone,/860,856/);
 } finally { globalThis.document=original; }
});
