import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { parseCSV, parseDialogue, parseLabels, makeCase, sortedActions, groupActions, validateBackup, actionCSV, summaryCSV, demoCase, toCSV } from '../site/core.js';
const source = 'Speaker,Utterance\r\nCharacter,"Hello, team"\r\nUser,"A ""quoted"" line\nnext line"\r\n';
test('two and three columns preserve quoted multiline Unicode evidence', () => {
  const turns = parseDialogue('\uFEFF' + source);
  assert.deepEqual(turns, [{id:1,speaker:'Character',text:'Hello, team'},{id:2,speaker:'User',text:'A "quoted" line\nnext line'}]);
  assert.deepEqual(parseDialogue('Utterance ID, speaker , UTTERANCE\n1,Character,"Hello, team"\n2,User,"A ""quoted"" line\nnext line"'), turns);
  assert.equal(parseDialogue('speaker,utterance\nUser,你好 👋\nUser,én')[0].text, '你好 👋');
});
test('rejects invalid numbering, malformed quotes and missing fields', () => {
  for (const csv of ['id,speaker,utterance\n2,User,Hello','id,speaker,utterance\n1,User,Hi\n1,Character,Hi','speaker,utterance\nUser,"oops','speaker,utterance\nUser,unquoted,comma','speaker,utterance\n,empty','speaker,utterance\nUser,""']) assert.throws(()=>parseDialogue(csv));
});
test('rater forms supply labels and never pre-existing annotations', () => {
  const c = makeCase('test', source, 'Phase,Action,Explanation,Sequence,Score (1-3),initiator\nPhase 1,New label,Definition,"1,4",3,U');
  assert.equal(c.labels[0].name,'New label'); assert.deepEqual(c.actions,[]);
  assert.throws(()=>parseLabels('Phase,Action,Explanation\n1,A,a\n1,A,a'));
});
test('sequence follows evidence, allows overlap and stable same-turn order', () => {
  const c = demoCase();
  c.actions = [{id:'late',order:1,utteranceIds:[8,10],labelId:'shared_goal',score:2},{id:'early',order:2,utteranceIds:[2,3],labelId:'check_readiness',score:3},{id:'overlap',order:3,utteranceIds:[2,4],labelId:'shared_goal',score:null}];
  assert.deepEqual(sortedActions(c).map(a=>[a.id,a.sequence]),[['early',1],['overlap',2],['late',3]]);
  c.actions[0].utteranceIds=[1]; assert.equal(sortedActions(c)[0].id,'late');
  c.actions=c.actions.filter(a=>a.id!=='early'); assert.deepEqual(sortedActions(c).map(a=>a.sequence),[1,2]);
  assert.equal(groupActions(c).find(g=>g.label.id==='shared_goal').actions.length,2);
});
test('backup roundtrip validates evidence, label IDs and scores', () => {
  const c=demoCase();c.actions=[{id:'a',order:1,utteranceIds:[2,4],labelId:'shared_goal',score:3}];
  const backup={version:1,cases:[c],activeCaseId:c.id};
  assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(backup))).cases[0].actions,c.actions);
  for(const mutate of [x=>x.cases[0].actions[0].utteranceIds=[99],x=>x.cases[0].actions[0].score=4,x=>x.cases[0].actions[0].labelId='missing',x=>x.cases[0].actions[0].utteranceIds=[2,2]]) {const bad=structuredClone(backup);mutate(bad);assert.throws(()=>validateBackup(bad));}
});
test('exports retain exact evidence, repeated occurrence scores and unfinished actions', () => {
  const c=demoCase(); c.actions=[{id:'b',order:1,utteranceIds:[6,8],labelId:'shared_goal',score:2},{id:'a',order:2,utteranceIds:[2],labelId:'shared_goal',score:3},{id:'c',order:3,utteranceIds:[12],labelId:null,score:null}];
  const rows=parseCSV(actionCSV(c));assert.equal(rows[1][3],'2');assert.equal(rows[1][8],'3');assert.equal(rows[2][3],'6,8');assert.equal(rows[3][7],'');
  const summary=parseCSV(summaryCSV(c));const shared=summary.find(r=>r[2]==='Establish shared goal (Feedup)');assert.equal(shared[3],'1,2');assert.equal(shared[4],'3,2');assert.equal(shared[5],'2 | 6,8');assert.equal(summary.at(-1)[2],'Unlabeled');
  assert.ok(!summary[0].includes('initiator')); assert.ok(toCSV([['=HYPERLINK("bad")']]).includes("'=HYPERLINK"));
});
const data=new URL('../../second_coder_sample/',import.meta.url);
if(existsSync(data)) test('all supplied cases load in both formats',()=>{
  const counts=[];
  for(const name of readdirSync(data).filter(s=>s.startsWith('case_')).sort()){
    const base=new URL(name+'/',data);const c=makeCase(name,readFileSync(new URL('dialogue.csv',base),'utf8'),readFileSync(new URL('rater_form.csv',base),'utf8'));
    counts.push(c.utterances.length);assert.equal(c.labels.length,8);
    const numbered=toCSV([['ID','Speaker','Utterance'],...c.utterances.map(u=>[u.id,u.speaker,u.text])]);assert.deepEqual(parseDialogue(numbered),c.utterances);
  }
  assert.deepEqual(counts,[49,19,29,15,25,25,23,37]);
});
