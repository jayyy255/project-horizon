const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { HotkeyManager } = require('../dist-electron/electron/hotkeys');
let serial = 0;
function fixture() {
  const file = path.resolve('scratch/hotkey-regressions', String(Date.now()), String(++serial), 'settings.json');
  const owned = new Map(), unavailable = new Set();
  const registry = {
    register: (key, callback) => { if (owned.has(key) || unavailable.has(key)) return false; owned.set(key, callback); return true; },
    unregister: key => owned.delete(key), isRegistered: key => owned.has(key),
  };
  let summons = 0;
  const create = () => new HotkeyManager(file, registry, () => summons++);
  return { file, owned, unavailable, registry, create, summons: () => summons };
}
test('Fresh install registers nothing until approval', () => {
  const f = fixture(), m = f.create();
  assert.equal(m.restore().approved, false); assert.equal(m.getStatus().active, false); assert.equal(f.owned.size, 0);
});
test('Approval stores the shortcut and invokes the summon callback', () => {
  const f = fixture(), m = f.create(), result = m.approve('CommandOrControl+Alt+H');
  assert.equal(result.success, true); assert.equal(result.active, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(f.file)), { approved: true, accelerator: 'CommandOrControl+Alt+H' });
  f.owned.get('CommandOrControl+Alt+H')(); assert.equal(f.summons(), 1);
});
test('Restart restores from native storage without a renderer', () => {
  const f = fixture(); f.create().approve('CommandOrControl+Space'); f.owned.clear();
  const result = f.create().restore(); assert.equal(result.active, true); assert.equal(result.label, 'Ctrl + Space');
});
test('Switching releases the previous shortcut', () => {
  const f = fixture(), m = f.create(); m.approve(); m.approve('CommandOrControl+Space');
  assert.deepEqual([...f.owned.keys()], ['CommandOrControl+Space']);
});
test('Conflict is reported while consent is saved and no shortcut is falsely active', () => {
  const f = fixture(), m = f.create(); f.unavailable.add('Super+Shift+C');
  const result = m.approve('Super+Shift+C'); assert.equal(result.success, false); assert.equal(result.approved, true);
  assert.equal(result.active, false); assert.match(result.error, /unavailable/);
  assert.equal(JSON.parse(fs.readFileSync(f.file)).approved, true);
});
test('A failed switch preserves the old working shortcut and saved choice', () => {
  const f = fixture(), m = f.create(); m.approve(); f.unavailable.add('CommandOrControl+Space');
  const result = m.approve('CommandOrControl+Space'); assert.equal(result.success, false); assert.equal(result.active, true);
  assert.equal(result.accelerator, 'CommandOrControl+Alt+H'); assert.deepEqual([...f.owned.keys()], ['CommandOrControl+Alt+H']);
  assert.equal(JSON.parse(fs.readFileSync(f.file)).accelerator, 'CommandOrControl+Alt+H');
});
test('Unavailable saved shortcut restores an available fallback and persists it', () => {
  const f = fixture(); f.create().approve('Super+Shift+C'); f.owned.clear(); f.unavailable.add('Super+Shift+C');
  const result = f.create().restore(); assert.equal(result.active, true); assert.equal(result.accelerator,'CommandOrControl+Alt+H');
  assert.match(result.notice,/was unavailable/); assert.equal(JSON.parse(fs.readFileSync(f.file)).accelerator,'CommandOrControl+Alt+H');
});
test('Repeated approval keeps one callback', () => {
  const f = fixture(), m = f.create(); m.approve(); assert.equal(m.approve().success, true); assert.equal(f.owned.size, 1);
});
test('Unsupported shortcut does not change registrations or settings', () => {
  const f = fixture(), m = f.create(); m.approve(); assert.equal(m.approve('Escape').success, false);
  assert.deepEqual([...f.owned.keys()], ['CommandOrControl+Alt+H']);
});
test('A save failure rolls back the new registration and retains the old one', () => {
  const f = fixture(), m = f.create(); m.approve(); fs.unlinkSync(f.file); fs.mkdirSync(f.file);
  const result = m.approve('CommandOrControl+Space'); assert.equal(result.success, false); assert.match(result.error, /save/);
  assert.deepEqual([...f.owned.keys()], ['CommandOrControl+Alt+H']);
});

test('New setups use Ctrl + Alt + H as the default',()=>{
  const f=fixture(),m=f.create();assert.equal(m.getStatus().label,'Ctrl + Alt + H');
  assert.equal(m.approve().active,true);assert.deepEqual([...f.owned.keys()],['CommandOrControl+Alt+H']);
});
test('Enable recovers from a blocked choice, clears the error and invokes the fallback',()=>{
  const f=fixture(),m=f.create();f.unavailable.add('Super+Shift+C');m.approve('Super+Shift+C');
  const result=m.approve();assert.equal(result.success,true);assert.equal(result.error,undefined);
  assert.match(result.notice,/Ctrl \+ Alt \+ H/);f.owned.get('CommandOrControl+Alt+H')();assert.equal(f.summons(),1);
});
test('Enable reports when every supported combination is blocked and retains the saved choice',()=>{
  const f=fixture(),m=f.create();for(const key of ['Super+Shift+C','CommandOrControl+Space','CommandOrControl+Alt+H'])f.unavailable.add(key);
  m.approve('Super+Shift+C');const result=m.approve();assert.equal(result.success,false);assert.equal(result.active,false);assert.match(result.error,/No supported shortcut/);
  assert.equal(f.owned.size,0);assert.equal(JSON.parse(fs.readFileSync(f.file)).accelerator,'Super+Shift+C');
});
test('Fallback registration rolls back on a save failure and does not try other shortcuts',()=>{
  const f=fixture(),m=f.create();f.unavailable.add('Super+Shift+C');m.approve('Super+Shift+C');
  const register=f.registry.register;const attempts=[];
  f.registry.register=(key,callback)=>{attempts.push(key);const result=register(key,callback);if(key==='CommandOrControl+Alt+H'){fs.unlinkSync(f.file);fs.mkdirSync(f.file);}return result;};
  const result=m.approve();assert.equal(result.success,false);assert.equal(result.active,false);assert.match(result.error,/save/);assert.equal(f.owned.size,0);
  assert.deepEqual(attempts,['Super+Shift+C','CommandOrControl+Alt+H']);
});
