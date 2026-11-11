import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../../js/creation/project-workspace.mjs', import.meta.url), 'utf8');
test('local saving and export are distinct, and PXD backup is visible outside secondary actions', () => {
  assert.match(source, /保存先：この端末のこのブラウザー/);
  assert.match(source, /ここに保存しただけでは公開されません/);
  assert.match(source, /このブラウザーに保存済み/);
  assert.match(source, /currentPane\.append\(currentCard, backupSection,/);
  assert.match(source, /backupSection\.append\(backupTitle, backupNote, exportButton, restoreNote\)/);
  assert.doesNotMatch(source, /actions\.append\([^;]*exportButton/);
  assert.match(source, /出力画面でダウンロードできます/);
  assert.match(source, /戻すときは［取り込む］/);
});
test('the empty manager uses the existing creation action rather than creating a second data path', () => {
  assert.match(source, /if \(!projects\.length && errors\.length === 0\) \{[\s\S]*?button\('＋ 最初の作品を作る', 'project-empty-new', \(\) => newButton\.click\(\)\)/);
  assert.match(source, /load: \(\) => store\.listProjects\(\), isVisible: \(\) => dialog\.open && !libraryPane\.hidden/);
});
