from pathlib import Path
r=Path('.')
def edit(path, before, after):
 p=r/path;s=p.read_text();assert before in s,path+': missing expected code';p.write_text(s.replace(before,after))
edit('tests/pixel-lens/file-save.test.mjs',"await import('../../js/pixel-lens/file-save.mjs')","await import('../../js/pixel-lens/file-save-core.mjs')")
edit('tests/ads/adsense-pages.test.mjs',"'output/index.html', 'camera/index.html'","'output/index.html', 'output/text/index.html', 'camera/index.html'")
edit('tests/ads/adsense-pages.test.mjs','assert.equal(established.length, 47)','assert.equal(established.length, 48)')
edit('tests/ads/adsense-pages.test.mjs','assert.equal(categorized.length, 47)','assert.equal(categorized.length, 48)')
edit('tests/ads/adsense-pages.test.mjs','assert.equal(expected.length, 47 +','assert.equal(expected.length, 48 +')
edit('tests/creation-suite/seo.test.mjs',"['https://pixieed.jp/output/', 'https://pixieed.jp/output/gif-speed/']","['https://pixieed.jp/output/', 'https://pixieed.jp/output/gif-speed/', 'https://pixieed.jp/output/text/']")
edit('tests/output/conversion-timeline.test.mjs',"assert.match(entry, /!query\\.has\\('id'\\)/);", "assert.match(entry, /if \\(query\\.has\\('id'\\) \\|\\| query\\.has\\('file'\\)\\)/); assert.match(entry, /else if \\(query\\.get\\('mode'\\) === 'convert'\\)/);")
for path in ['js/creation/pxd-ui.mjs','js/creation/project-workspace.mjs']:
 p=r/path;s=p.read_text();s="import { routeEditorFile } from './output-router.mjs?rev=20261028-unified-output-1';\n"+s
 start=s.index('async function download(bytes, name) {');end=s.index('\n}',s.index('async function sendPxdBackup(bytes, name) {',start))+2
 s=s[:start]+'''async function sendPxdBackup(bytes, name) {
  // Stage the exact backup; PXD is never decoded by the image converter.
  await routeEditorFile(new Blob([bytes], { type: 'application/octet-stream' }), name);
  return true;
}'''+s[end:];p.write_text(s)
edit('js/creation/text-tools.mjs',"  const id=params.get('id');\n  if(id&&params.getAll('id').length===1&&!params.has('file')&&/^[a-f\\d]{8}-[a-f\\d]{4}-4[a-f\\d]{3}-[89ab][a-f\\d]{3}-[a-f\\d]{12}$/i.test(id)){\n    try{const {readToolOutput}=await import('./output-handoff.mjs?rev=20261028-text-1');const record=await readToolOutput(id);if(record.blob)chooseFile(new File([record.blob],record.filename,{type:record.blob.type}));}catch{/* The existing receiver reports unavailable private files. */}\n  }",'''  const key=params.has('id')?'id':params.has('file')?'file':null, id=key&&params.get(key);
  if(id&&params.getAll(key).length===1&&!(params.has('id')&&params.has('file'))&&/^[a-f\\d]{8}-[a-f\\d]{4}-4[a-f\\d]{3}-[89ab][a-f\\d]{3}-[a-f\\d]{12}$/i.test(id)){
    try {
      const record=key==='id'
        ?await (await import('./output-handoff.mjs?rev=20261028-unified-output-1')).readToolOutput(id)
        :await (await import('./output-router.mjs?rev=20261028-unified-output-1')).readOutputFile(id);
      if(record.blob)chooseFile(new File([record.blob],record.filename,{type:record.blob.type}));
    }catch{/* The existing receiver reports unavailable private files. */}
  }''')
edit('js/creation/conversion-page.mjs',"    for (const el of main.querySelectorAll('button,input,select')) if (!el.matches('[data-cancel]')) el.disabled = value || el.dataset.boundary === 'true';", "    const controls = main.querySelector('.text-legacy') || main;\n    for (const el of controls.querySelectorAll('button,input,select')) if (!el.matches('[data-cancel]')) el.disabled = value || el.dataset.boundary === 'true';\n    for (const button of main.querySelectorAll('.text-mode-nav button')) button.disabled = value;")
p=r/'tests/creation-suite/output-handoff.test.mjs';s=p.read_text()
s=s.replace("test('PXD project backups download directly from the editor and never navigate to the output page'", "test('PXD backups use unified file staging and never enter lossy media conversion'")
s=s.replace("    assert.match(source, /async function sendPxdBackup\\(bytes, name\\) \\{\\s*await download\\(bytes, name\\);\\s*return false;/);", "    assert.match(source, /async function sendPxdBackup\\(bytes, name\\)[\\s\\S]*?await routeEditorFile\\(new Blob\\(\\[bytes\\], \\{ type: 'application\\/octet-stream' \\}\\), name\\);[\\s\\S]*?return true;/);")
s=s.replace("    assert.match(source, /URL\\.createObjectURL\\(blob\\).*?link\\.download = name; link\\.click\\(\\)/s, 'the project tool creates a local browser download');", "    assert.doesNotMatch(source, /link\\.click\\(\\)/, 'detached anchors must not bypass the output workspace');")
s=s.replace("test('validated draw, camera, and audio embeds flush editor saves then leave native file saving to the caller'", "test('validated draw, camera, and audio embeds save then navigate the host to unified output'")
s=s.replace("    const locationRef = { origin: 'https://example.test', assigned: '', assign(url) { this.assigned = url; } };\n    const windowRef = {\n      location: { origin: locationRef.origin },\n      parent: { location: { origin: locationRef.origin } },", "    const locationRef = { origin: 'https://example.test', pathname: `/${role}/`, search: '', hash: '', assigned: '', assign(url) { this.assigned = url; } };\n    const parentLocation = { ...locationRef };\n    const windowRef = {\n      location: locationRef,\n      parent: { location: parentLocation },")
s=s.replace("    }, () => true, { locationRef, windowRef });\n    assert.deepEqual(calls, ['authorize', 'save']);\n    assert.equal(result.ok, false);\n    assert.equal(result.reason, 'embedded_native_save', `${role} embed uses caller's native file save`);\n    assert.equal(locationRef.assigned, '');", "    }, () => true, { locationRef, windowRef, indexedDBRef: new FakeIndexedDB(), cryptoRef: { randomUUID: () => validId }, now: () => 1000 });\n    assert.deepEqual(calls, ['authorize', 'save']);\n    assert.equal(result.ok, true);\n    assert.match(parentLocation.assigned, /^https:\\/\\/example\\.test\\/output\\/work\\/\\?id=/);\n    assert.equal(locationRef.assigned, '', 'only the parent navigates');")
p.write_text(s)
p=r/'tests/build/tool-runtime-delivery.test.mjs';s=p.read_text().replace('plan.runtimeGraph.modules.size, 103','plan.runtimeGraph.modules.size, 105').replace('plan.runtimeGraph.edges.length, 194','plan.runtimeGraph.edges.length, 200').replace('plan.dynamicGraph.modules.size, 100','plan.dynamicGraph.modules.size, 103').replace('plan.externalUrls.size, 51','plan.externalUrls.size, 53').replace('report.externalCount, 51','report.externalCount, 53')
s=s.replace("  assert(files.includes('js/creation/draw-render-optimization.mjs'));","  assert(files.includes('js/creation/draw-render-optimization.mjs'));\n  assert(files.includes('js/creation/output-router.mjs'), 'editor exports use the unified staging module');\n  assert(files.includes('js/creation/output-handoff-core.mjs'), 'existing storage identity stays shared');")
p.write_text(s)
p=r/'tests/output/unified-output.test.mjs';p.write_text(p.read_text()+'''

test('camera save wrapper stages once and never opens the removed editor dialog', async () => {
  const { createCameraFileSave } = await import('../../js/pixel-lens/file-save.mjs');
  const d = deps('/camera/'), blob = file().blob;
  const controller = createCameraFileSave({ ...d, dialog: { showModal() { assert.fail('editor save dialog'); } } });
  assert.equal(controller.show({ blob, filename: 'camera.png', isCurrent: () => false }), false);
  assert.equal(controller.show({ blob, filename: 'camera.png', isCurrent: () => true }), true);
  assert.equal(controller.show({ blob, filename: 'camera.png', isCurrent: () => true }), false);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(d.assigned.length, 1);
  assert.equal(await (await readOutputFile(ID, d)).blob.text(), await blob.text());
});
''')
