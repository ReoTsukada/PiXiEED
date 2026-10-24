import { creationModeEntryUrl } from './creation/mode-entry.mjs?rev=20261016-tool-shell-1';

const section = document.querySelector('[data-tool-embed][data-tool-shell]');
const shell = document.querySelector('body[data-tool-shell]');
if (!section || !shell) throw new Error('制作ツールのページを準備できませんでした。');

const params = new URLSearchParams(location.search);
const knownModes = new Set(['draw', 'camera', 'audio']);
const requestedMode = params.get('mode');
const directCandidate = params.get('runtime') !== 'iframe';
const isAudioRoute = location.pathname.replace(/index\.html$/, '').replace(/\/+$/, '') === '/audio';
const isCameraRoute = location.pathname.replace(/index\.html$/, '').replace(/\/+$/, '') === '/camera';
const mode = directCandidate && knownModes.has(requestedMode) ? requestedMode : isAudioRoute ? 'audio' : isCameraRoute ? 'camera' : knownModes.has(requestedMode) ? requestedMode : 'draw';
section.dataset.toolMode = mode;
shell.classList.remove('tool-shell--draw', 'tool-shell--camera', 'tool-shell--audio');
shell.classList.add(`tool-shell--${mode}`);

const copy = {
  draw: {
    eyebrow: 'PIXIEEDRAW', title: 'ドット絵・ピクセルアートを描く',
    documentTitle: 'ドット絵・ピクセルアートを描く｜アニメーションGIF作成｜PiXiEEDraw',
    lead: 'ピクセルアート（Pixel Art）でゲーム素材などの小さな絵を描き、コマをつないでGIFも作れます。',
    workspace: '描画・カメラ・音楽を同じ作品で切り替えて使えます.',
    workspaceTitle: 'このページで制作する',
  },
  camera: {
    eyebrow: 'PiXiEEDraw · PiXiEELENS', title: '写真・画像をドット絵に変換',
    documentTitle: '写真・画像をドット絵に変換｜PiXiEEDraw カメラモード',
    lead: '絵を描かずに、写真をドット絵に加工できます。画像の読込や撮影から、ピクセルの細かさや色数を調整します。',
    workspace: '描画・音楽も同じ作品で切り替えられます。',
    workspaceTitle: 'このページで画像を変換する',
  },
  audio: {
    eyebrow: 'PIXIEEDAUDIO', title: '短いループ曲をつくる',
    documentTitle: '短いループ曲をつくる｜PiXiEEaudio',
    lead: '短いループ曲を、マス目に色を置いて試せます。音色とテンポを選び、再生して聴きながら整えます。',
    workspace: '色を音に割り当て、フレームとテンポを編集して曲にします。',
    workspaceTitle: 'このページで音楽を作る',
  },
}[mode];
document.querySelector('[data-shell-eyebrow]').textContent = copy.eyebrow;
document.querySelector('[data-shell-title]').textContent = copy.title;
document.querySelector('[data-shell-lead]').textContent = copy.lead;
document.querySelector('[data-shell-workspace-copy]').textContent = copy.workspace.replace(/\.$/, '。');
document.querySelector('#tool-embed-title').textContent = copy.workspaceTitle;
document.title = copy.documentTitle;

function queryWithAdapter() {
  if (directCandidate && mode === 'draw' && !['standalone','to','drawRequest','audioRequest','drawCamera','audioCamera'].some(key => params.has(key))) return new URLSearchParams(location.search);
  if (!isAudioRoute && !isCameraRoute) return new URLSearchParams(location.search);
  if (params.getAll('mode').length > 1) {
    throw new TypeError('モードが複数指定されています。URLの mode 値をひとつにして開き直してください。');
  }
  const adapted = creationModeEntryUrl(mode, location.search);
  if (!adapted) {
    // Legacy standalone and handoff URLs retain their independent runtime.
    const legacyRuntime = isCameraRoute ? '/pixel-camera.html' : '/audio/editor.html';
    location.replace(`${legacyRuntime}${location.search}${location.hash}`);
    return null;
  }
  return new URL(adapted, location.href).searchParams;
}

let forwarded;
try {
  forwarded = queryWithAdapter();
} catch (error) {
  const status = section.querySelector('[data-embed-status]');
  if (status) status.textContent = error.message || '制作ツールを準備できませんでした。';
  throw error;
}
// A legacy dispatch is an expected navigation, not an application error.
if (forwarded) {
if ((isAudioRoute || isCameraRoute) && !forwarded.has('mode')) forwarded.append('mode', mode);

if (directCandidate) {
  const { installDirectToolShell } = await import('./tool-direct.mjs?rev=20261024-all-tools-offerwall-1');
  installDirectToolShell({ section, mode, search: forwarded });
} else {

// The parent controller owns the bridge channel. Replacing these reserved
// transport fields is safe; every application and unknown query value remains
// in order, including duplicates, and the fragment is carried separately.
for (const key of ['embed', 'embedRole', 'channel', 'workspace']) forwarded.delete(key);
const childRole = mode;
forwarded.set('embed', '1');
forwarded.set('embedRole', childRole);
forwarded.set('channel', crypto.randomUUID());
const runtime = new URL('/draw/editor.html', location.origin);
runtime.search = forwarded.toString();
runtime.hash = location.hash;
section.dataset.embedUrl = runtime.href;

// The controller consumes data-embed-url and data-embed-auto on import.
await import('/js/tool-embed.mjs?rev=20261017-workspace-entry-1');
}
}
