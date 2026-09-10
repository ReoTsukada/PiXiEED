(() => {
  "use strict";

  const KEY = "pixieed:visual-studio:v1";
  const projectStore = window.PiXiEEDCreatorProjectStore;
  const blobStore = window.PiXiEEDVisualBlobStore;
  const projectContext = projectStore && typeof projectStore.context === "function"
    ? projectStore.context()
    : { projectId: "local-project", projectName: "無題のProject" };
  let projectMissing = projectContext.projectExists === false;
  const projectId = String(projectContext.projectId || "local-project");
  const $ = (id) => document.getElementById(id);
  const uid = (prefix) => {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  };
  const baseState = {
    version: 1,
    kind: "pixieed-visual-project",
    projectId,
    mode: "image",
    title: "Untitled Visual Project",
    assets: [],
    layers: [],
    clips: [],
    adjustments: { brightness: 0, contrast: 0, saturation: 0 },
    transform: { x: 0, y: 0, scale: 1, rotation: 0, crop: "Canvas全体" },
    preview: { quality: "Draft · 軽量", loop: true, audio: true },
    audio: { start: 0, end: 20 },
    selectedAsset: null,
    selectedLayer: null,
  };

  const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  const number = (value, fallback, min, max) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  };
  const safeName = (name) => String(name || "untitled")
    .replace(/[\\/:*?"<>|]/g, "_")
    .slice(0, 80);
  const text = (value, fallback, max) => {
    const result = String(value == null ? "" : value)
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim();
    return result ? result.slice(0, max) : fallback;
  };
  const clone = (value) => {
    try { return JSON.parse(JSON.stringify(value)); } catch (_error) { return null; }
  };
  const contentHashForBlob = async (blob) => {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let hash = 0xcbf29ce484222325n;
    for (const byte of bytes) {
      hash ^= BigInt(byte);
      hash = BigInt.asUintN(64, hash * 0x100000001b3n);
    }
    return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
  };

  const normalizeAsset = (value) => {
    const source = isRecord(value) ? value : {};
    const id = text(source.id, uid("asset"), 256);
    const kind = String(source.kind || "image").toLowerCase() === "video" ? "video" : "image";
    return {
      id,
      name: text(source.name, kind === "video" ? "Untitled Video" : "Untitled Image", 160),
      kind,
      mime: text(source.mime, kind === "video" ? "video/*" : "image/*", 160),
      size: Math.max(0, Number(source.size) || 0),
      width: Math.max(1, Number(source.width) || 1280),
      height: Math.max(1, Number(source.height) || 720),
      revisionId: text(source.revisionId, "", 256),
      contentHash: text(source.contentHash, "", 80),
      blobKey: text(source.blobKey, `${projectId}:${id}`, 600),
      hasBlob: source.hasBlob === true,
      url: "",
      file: null,
    };
  };

  const normalizeState = (value) => {
    const source = isRecord(value) ? value : {};
    const adjustments = isRecord(source.adjustments) ? source.adjustments : {};
    const transform = isRecord(source.transform) ? source.transform : {};
    const preview = isRecord(source.preview) ? source.preview : {};
    const audio = isRecord(source.audio) ? source.audio : {};
    const audioStart = number(audio.start, 0, 0, 59.9);
    const audioEnd = number(audio.end, 20, Math.min(60, audioStart + 0.1), 60);
    const assets = Array.isArray(source.assets) ? source.assets.map(normalizeAsset) : [];
    const assetIds = new Set(assets.map((asset) => asset.id));
    const layers = (Array.isArray(source.layers) ? source.layers : [])
      .map((layer) => {
        if (!isRecord(layer)) return null;
        const assetId = text(layer.assetId, "", 256);
        if (!assetIds.has(assetId)) return null;
        return {
          id: text(layer.id, uid("layer"), 256),
          assetId,
          name: text(layer.name, assets.find((asset) => asset.id === assetId)?.name || "Layer", 160),
          visible: layer.visible !== false,
        };
      })
      .filter(Boolean);
    const clips = (Array.isArray(source.clips) ? source.clips : [])
      .map((clip) => {
        if (!isRecord(clip)) return null;
        const assetId = text(clip.assetId, "", 256);
        if (!assetIds.has(assetId)) return null;
        const inPoint = Math.max(0, Number(clip.in) || 0);
        const outPoint = Math.max(inPoint + 0.1, Number(clip.out) || 20);
        return {
          id: text(clip.id, uid("clip"), 256),
          assetId,
          name: text(clip.name, assets.find((asset) => asset.id === assetId)?.name || "Clip", 160),
          in: inPoint,
          out: outPoint,
        };
      })
      .filter(Boolean);
    const selectedAsset = assetIds.has(source.selectedAsset) ? source.selectedAsset : assets[0]?.id || null;
    const selectedLayer = layers.some((layer) => layer.id === source.selectedLayer)
      ? source.selectedLayer
      : layers.find((layer) => layer.assetId === selectedAsset)?.id || null;
    return {
      ...baseState,
      ...source,
      projectId,
      kind: "pixieed-visual-project",
      version: 1,
      mode: String(source.mode || "image").toLowerCase() === "video" ? "video" : "image",
      title: text(source.title, baseState.title, 100),
      assets,
      layers,
      clips,
      adjustments: {
        brightness: number(adjustments.brightness, 0, -100, 100),
        contrast: number(adjustments.contrast, 0, -100, 100),
        saturation: number(adjustments.saturation, 0, -100, 100),
      },
      transform: {
        x: number(transform.x, 0, -4096, 4096),
        y: number(transform.y, 0, -4096, 4096),
        scale: number(transform.scale, 1, 0.1, 8),
        rotation: number(transform.rotation, 0, -360, 360),
        crop: text(transform.crop, "Canvas全体", 160),
      },
      preview: {
        quality: text(preview.quality, "Draft · 軽量", 80),
        loop: preview.loop !== false,
        audio: preview.audio !== false,
      },
      audio: {
        start: audioStart,
        end: audioEnd,
      },
      selectedAsset,
      selectedLayer,
    };
  };

  const readInitialState = () => {
    try {
      const linked = projectStore && typeof projectStore.get === "function"
        ? projectStore.get(projectId)
        : null;
      const linkedVisual = linked && linked.modules && linked.modules.visual;
      const legacy = JSON.parse(
        localStorage.getItem(`${KEY}:${projectId}`) || localStorage.getItem(KEY) || "null",
      );
      const saved = linkedVisual && linkedVisual.kind === "pixieed-visual-project"
        ? linkedVisual
        : legacy;
      return normalizeState(saved && saved.kind === "pixieed-visual-project" ? saved : baseState);
    } catch (_error) {
      return normalizeState(baseState);
    }
  };

  const state = readInitialState();
  const objectUrls = new Map();
  let toastTimer;
  let renderVersion = 0;
  let hydrationVersion = 0;
  let exportingVideo = false;

  const notify = (message) => {
    const element = $("toast");
    if (!element) return;
    element.textContent = message;
    element.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => element.classList.remove("is-visible"), 2400);
  };

  const download = (name, body, type) => {
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(new Blob([body], { type }));
    anchor.download = name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
  };

  const releaseObjectUrl = (asset) => {
    const url = objectUrls.get(asset.id);
    if (url) URL.revokeObjectURL(url);
    objectUrls.delete(asset.id);
    asset.url = "";
  };

  const attachBlob = (asset, blob, persisted = false) => {
    if (!(blob instanceof Blob)) return false;
    releaseObjectUrl(asset);
    const url = URL.createObjectURL(blob);
    objectUrls.set(asset.id, url);
    asset.file = blob;
    asset.url = url;
    asset.mime = blob.type || asset.mime;
    asset.size = blob.size;
    asset.hasBlob = persisted;
    return true;
  };

  const updateAssetDimensions = (asset) => new Promise((resolve) => {
    if (!asset.url) { resolve(); return; }
    if (asset.kind === "video") {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        asset.width = Math.max(1, Math.round(video.videoWidth || asset.width));
        asset.height = Math.max(1, Math.round(video.videoHeight || asset.height));
        video.src = "";
        resolve();
      };
      video.onerror = () => resolve();
      video.src = asset.url;
      return;
    }
    const image = new Image();
    image.onload = () => {
      asset.width = Math.max(1, Math.round(image.naturalWidth || asset.width));
      asset.height = Math.max(1, Math.round(image.naturalHeight || asset.height));
      resolve();
    };
    image.onerror = () => resolve();
    image.src = asset.url;
  });

  const hydrateAssets = async () => {
    if (!blobStore || typeof blobStore.get !== "function") return;
    const version = ++hydrationVersion;
    let missing = 0;
    for (const asset of state.assets) {
      if (asset.file instanceof Blob) continue;
      const record = await blobStore.get(projectId, asset.id);
      if (version !== hydrationVersion) return;
      if (record && attachBlob(asset, record.blob, true)) {
        const actualHash = await contentHashForBlob(record.blob).catch(() => "");
        if (actualHash && actualHash !== asset.contentHash) {
          asset.contentHash = actualHash;
          asset.revisionId = uid("revision");
        } else if (actualHash && !asset.revisionId) {
          asset.revisionId = uid("revision");
        }
        await updateAssetDimensions(asset);
      } else if (asset.hasBlob) {
        missing += 1;
      }
      render();
    }
    if (missing > 0) notify(`${missing}件の素材ファイルを再選択してください`);
  };

  const serialize = () => ({
    version: 1,
    kind: "pixieed-visual-project",
    projectId,
    title: state.title,
    mode: state.mode,
    assets: state.assets.map(({ file: _file, url: _url, ...asset }) => ({
      ...asset,
      blobKey: asset.blobKey || `${projectId}:${asset.id}`,
      hasBlob: asset.hasBlob === true,
    })),
    layers: state.layers.map((layer) => ({ ...layer })),
    clips: state.clips.map((clip) => ({ ...clip })),
    adjustments: { ...state.adjustments },
    transform: { ...state.transform },
    preview: { ...state.preview },
    audio: { ...state.audio },
    selectedAsset: state.selectedAsset,
    selectedLayer: state.selectedLayer,
  });

  const saveLocal = async () => {
    if (projectMissing) {
      notify("Projectが見つからないため保存できません");
      return;
    }
    let failed = 0;
    for (const asset of state.assets) {
      if (!(asset.file instanceof Blob)) continue;
      const actualHash = await contentHashForBlob(asset.file).catch(() => "");
      if (actualHash && actualHash !== asset.contentHash) {
        asset.contentHash = actualHash;
        asset.revisionId = uid("revision");
      } else if (actualHash && !asset.revisionId) {
        asset.revisionId = uid("revision");
      }
      const saved = blobStore && typeof blobStore.put === "function"
        ? await blobStore.put(projectId, asset.id, asset.file, asset)
        : false;
      asset.hasBlob = saved;
      if (!saved) failed += 1;
    }
    const snapshot = serialize();
    try {
      localStorage.setItem(`${KEY}:${projectId}`, JSON.stringify(snapshot));
      localStorage.setItem(KEY, JSON.stringify(snapshot));
    } catch (_error) {
      failed += 1;
    }
    if (projectStore && typeof projectStore.update === "function") {
      projectStore.update(projectId, (project) => ({
        ...project,
        modules: { ...(project.modules || {}), visual: snapshot },
      }));
    }
    notify(failed > 0 ? "Projectを保存しました（一部の素材保存に失敗）" : "Projectへ保存しました");
  };

  const setEmptyCanvas = (title, detail, visible = true) => {
    const empty = $("emptyCanvas");
    if (!empty) return;
    const strong = empty.querySelector("strong");
    const span = empty.querySelector("span");
    if (strong) strong.textContent = title;
    if (span) span.textContent = detail;
    empty.style.display = visible ? "flex" : "none";
  };

  const renderAssets = () => {
    const list = $("assetList");
    if (!list) return;
    list.replaceChildren();
    if (!state.assets.length) {
      const empty = document.createElement("div");
      empty.className = "panel-help";
      empty.textContent = "まだ素材がありません";
      list.append(empty);
      return;
    }
    state.assets.forEach((asset) => {
      const item = document.createElement("div");
      item.className = `asset-item${state.selectedAsset === asset.id ? " is-selected" : ""}`;
      item.tabIndex = 0;
      item.setAttribute("role", "button");
      const thumb = document.createElement("div");
      thumb.className = `asset-thumb${asset.url ? "" : " is-missing"}`;
      if (asset.kind === "image" && asset.url) {
        const image = document.createElement("img");
        image.src = asset.url;
        image.alt = "";
        thumb.append(image);
      } else {
        const marker = document.createElement("span");
        marker.textContent = asset.kind === "video" ? "▶" : "?";
        thumb.append(marker);
      }
      const meta = document.createElement("div");
      meta.className = "asset-meta";
      const name = document.createElement("strong");
      name.textContent = asset.name;
      const detail = document.createElement("span");
      detail.textContent = `${asset.kind === "video" ? "Video" : "Image"} · ${asset.width}×${asset.height}`;
      meta.append(name, detail);
      if (!asset.url) {
        const missing = document.createElement("small");
        missing.className = "asset-missing";
        missing.textContent = "ファイル未接続";
        meta.append(missing);
        item.removeAttribute("role");
        item.tabIndex = -1;
        const reconnect = document.createElement("button");
        reconnect.type = "button";
        reconnect.className = "text-button";
        reconnect.textContent = "再接続";
        reconnect.title = `${asset.name}へファイルを再接続`;
        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = asset.kind === "video" ? "video/*" : "image/*";
        fileInput.hidden = true;
        fileInput.addEventListener("change", async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          const expectedPrefix = asset.kind === "video" ? "video/" : "image/";
          if (!String(file.type || "").startsWith(expectedPrefix)) {
            notify(`${asset.kind === "video" ? "動画" : "画像"}ファイルを選択してください`);
            return;
          }
          attachBlob(asset, file, false);
          await updateAssetDimensions(asset);
          render();
          await saveLocal();
          notify("既存Assetへファイルを再接続しました");
        });
        reconnect.addEventListener("click", (event) => {
          event.stopPropagation();
          fileInput.click();
        });
        item.append(reconnect, fileInput);
      }
      item.append(thumb, meta);
      const select = () => {
        state.selectedAsset = asset.id;
        state.mode = asset.kind;
        let layer = state.layers.find((candidate) => candidate.assetId === asset.id);
        if (!layer) {
          layer = { id: uid("layer"), assetId: asset.id, name: asset.name, visible: true };
          state.layers.unshift(layer);
        }
        state.selectedLayer = layer.id;
        render();
      };
      item.addEventListener("click", select);
      item.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(); }
      });
      list.append(item);
    });
  };

  const renderLayers = () => {
    const list = $("layerList");
    if (!list) return;
    list.replaceChildren();
    if (!state.layers.length) {
      const empty = document.createElement("div");
      empty.className = "panel-help";
      empty.textContent = "素材を選択するとレイヤーになります";
      list.append(empty);
      return;
    }
    state.layers.forEach((layer) => {
      const item = document.createElement("div");
      item.className = `layer-item${state.selectedLayer === layer.id ? " is-selected" : ""}`;
      const visibility = document.createElement("button");
      visibility.type = "button";
      visibility.className = "layer-visibility";
      visibility.textContent = layer.visible ? "◉" : "○";
      visibility.title = layer.visible ? "レイヤーを非表示" : "レイヤーを表示";
      visibility.setAttribute("aria-pressed", String(layer.visible));
      visibility.addEventListener("click", (event) => {
        event.stopPropagation();
        layer.visible = !layer.visible;
        render();
      });
      const label = document.createElement("span");
      label.textContent = layer.name;
      item.append(visibility, label);
      item.addEventListener("click", () => {
        state.selectedLayer = layer.id;
        state.selectedAsset = layer.assetId;
        const asset = state.assets.find((candidate) => candidate.id === layer.assetId);
        if (asset) state.mode = asset.kind;
        render();
      });
      list.append(item);
    });
  };

  const renderClips = () => {
    const list = $("clipList");
    if (!list) return;
    list.replaceChildren();
    if (!state.clips.length) {
      const empty = document.createElement("div");
      empty.className = "panel-help";
      empty.textContent = "動画素材を選択するとClipを追加できます";
      list.append(empty);
      return;
    }
    state.clips.forEach((clip) => {
      const item = document.createElement("div");
      item.className = "clip-item";
      const name = document.createElement("span");
      name.className = "clip-name";
      name.textContent = clip.name;
      const makePoint = (label, key, min) => {
        const wrapper = document.createElement("label");
        wrapper.textContent = `${label} `;
        const input = document.createElement("input");
        input.type = "number";
        input.min = String(min);
        input.step = "0.1";
        input.value = String(clip[key]);
        input.addEventListener("change", () => {
          const value = Math.max(min, Number(input.value) || 0);
          if (key === "in") clip.in = Math.min(value, clip.out - 0.1);
          else clip.out = Math.max(value, clip.in + 0.1);
          renderClips();
          renderInspector();
          draw();
        });
        wrapper.append(input);
        return wrapper;
      };
      const splitButton = document.createElement("button");
      splitButton.type = "button";
      splitButton.className = "text-button";
      splitButton.title = "Clipを分割";
      splitButton.textContent = "分割";
      splitButton.addEventListener("click", () => {
        const split = Math.max(clip.in + 0.1, Math.min(clip.out - 0.1, (clip.in + clip.out) / 2));
        const index = state.clips.indexOf(clip);
        state.clips.splice(
          index,
          1,
          { ...clip, out: split },
          { ...clip, id: uid("clip"), name: `${clip.name} (分割 2)`, in: split },
        );
        renderClips();
        renderInspector();
        draw();
        notify("Clipを分割しました");
      });
      item.append(name, makePoint("IN", "in", 0), makePoint("OUT", "out", 0.1), splitButton);
      list.append(item);
    });
  };

  const renderInspector = () => {
    const asset = state.assets.find((candidate) => candidate.id === state.selectedAsset);
    const range = currentVideoRange();
    $("selectionLabel").textContent = asset ? asset.name : "選択なし";
    ["brightness", "contrast", "saturation"].forEach((key) => {
      $(key).value = String(state.adjustments[key]);
      $(`${key}Value`).textContent = String(state.adjustments[key]);
    });
    Object.entries({
      transformX: state.transform.x,
      transformY: state.transform.y,
      transformScale: state.transform.scale,
      transformRotation: state.transform.rotation,
    }).forEach(([id, value]) => { $(id).value = String(value); });
    $("cropState").textContent = state.transform.crop;
    $("previewQuality").value = state.preview.quality;
    $("loopPreview").checked = state.preview.loop;
    $("includeAudio").checked = state.preview.audio;
    $("audioStart").value = String(range.start);
    $("audioEnd").value = String(range.end);
    $("audioStartValue").textContent = `${Number(range.start).toFixed(1)}s`;
    $("audioEndValue").textContent = `${Number(range.end).toFixed(1)}s`;
  };

  const paintSource = (ctx, source, width, height) => {
    ctx.save();
    ctx.translate(640 + Number(state.transform.x), 360 + Number(state.transform.y));
    ctx.rotate(Number(state.transform.rotation) * Math.PI / 180);
    const scale = Math.min(1280 / Math.max(1, width), 720 / Math.max(1, height))
      * Number(state.transform.scale);
    ctx.filter = `brightness(${100 + Number(state.adjustments.brightness)}%) contrast(${100 + Number(state.adjustments.contrast)}%) saturate(${100 + Number(state.adjustments.saturation)}%)`;
    ctx.drawImage(source, -width * scale / 2, -height * scale / 2, width * scale, height * scale);
    ctx.restore();
  };

  const draw = () => {
    const canvas = $("creativeCanvas");
    const video = $("videoPreview");
    const ctx = canvas.getContext("2d");
    ctx.filter = "none";
    ctx.fillStyle = "#1b1d22";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const asset = state.assets.find((candidate) => candidate.id === state.selectedAsset) || state.assets[0];
    const layer = state.layers.find((candidate) => candidate.id === state.selectedLayer)
      || state.layers.find((candidate) => candidate.assetId === asset?.id);
    if (!asset) {
      canvas.hidden = false;
      video.hidden = true;
      video.pause();
      setEmptyCanvas("素材を追加して制作を開始", "画像・動画を左の素材一覧へドラッグするか、＋から選択");
      return;
    }
    if (layer && layer.visible === false && asset.kind === "video") {
      canvas.hidden = false;
      video.hidden = true;
      video.pause();
      setEmptyCanvas("このレイヤーは非表示です", "レイヤー一覧の◉から表示できます");
      return;
    }
    if (!asset.url) {
      canvas.hidden = false;
      video.hidden = true;
      video.pause();
      setEmptyCanvas("素材ファイルを再接続してください", `${asset.name} · ローカルBlobが見つかりません`);
      return;
    }
    if (asset.kind === "video") {
      canvas.hidden = true;
      video.hidden = false;
      if (video.dataset.assetId !== asset.id || video.src !== asset.url) {
        video.src = asset.url;
        video.dataset.assetId = asset.id;
        video.currentTime = currentVideoRange().start;
      }
      video.loop = state.preview.loop;
      video.muted = !state.preview.audio;
      video.style.filter = `brightness(${100 + Number(state.adjustments.brightness)}%) contrast(${100 + Number(state.adjustments.contrast)}%) saturate(${100 + Number(state.adjustments.saturation)}%)`;
      video.style.transform = `translate(${state.transform.x}px, ${state.transform.y}px) rotate(${state.transform.rotation}deg) scale(${state.transform.scale})`;
      video.play().catch(() => {});
      setEmptyCanvas("", "", false);
      return;
    }
    canvas.hidden = false;
    video.hidden = true;
    video.pause();
    video.removeAttribute("src");
    video.dataset.assetId = "";
    setEmptyCanvas("", "", false);
    const imageAssets = state.layers
      .slice()
      .reverse()
      .filter((candidate) => candidate.visible !== false)
      .map((candidate) => state.assets.find((item) => item.id === candidate.assetId))
      .filter((candidate) => candidate && candidate.kind === "image" && candidate.url);
    if (!imageAssets.length && asset.kind === "image") imageAssets.push(asset);
    if (!imageAssets.length) {
      setEmptyCanvas("表示中の画像レイヤーがありません", "レイヤー一覧の○から表示するか、ファイルを追加してください");
      return;
    }
    const version = ++renderVersion;
    Promise.all(imageAssets.map((imageAsset) => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ image, asset: imageAsset });
      image.onerror = reject;
      image.src = imageAsset.url;
    }))).then((loaded) => {
      if (version !== renderVersion) return;
      for (const entry of loaded) {
        paintSource(
          ctx,
          entry.image,
          entry.image.naturalWidth || entry.asset.width,
          entry.image.naturalHeight || entry.asset.height,
        );
      }
    }).catch(() => {
      if (version === renderVersion) setEmptyCanvas("素材を読み込めません", "ファイルを再選択して保存してください");
    });
  };

  const selectedVideoClip = () => state.clips.find((clip) => clip.assetId === state.selectedAsset) || null;
  const currentVideoRange = () => {
    const clip = selectedVideoClip();
    return clip
      ? { start: clip.in, end: clip.out }
      : { start: state.audio.start, end: state.audio.end };
  };
  const seekVideo = (video, time) => new Promise((resolve) => {
    if (!(video instanceof HTMLVideoElement) || !Number.isFinite(time)) {
      resolve(false);
      return;
    }
    const target = Math.max(0, time);
    if (Math.abs(video.currentTime - target) < 0.05) {
      resolve(true);
      return;
    }
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      video.removeEventListener("seeked", onSeeked);
      window.clearTimeout(timeout);
      resolve(ok);
    };
    const onSeeked = () => finish(true);
    const timeout = window.setTimeout(() => finish(false), 1800);
    video.addEventListener("seeked", onSeeked, { once: true });
    try {
      video.currentTime = target;
    } catch (_error) {
      finish(false);
    }
  });

  const render = () => {
    $("projectTitle").value = state.title;
    $("libraryTitle").textContent = state.mode === "image" ? "画像素材" : "動画素材";
    $("canvasLabel").textContent = state.mode === "image" ? "Canvas · 1280 × 720" : "Preview · 1280 × 720";
    document.querySelectorAll(".mode-tab").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.mode === state.mode);
      button.setAttribute("aria-pressed", String(button.dataset.mode === state.mode));
    });
    document.querySelectorAll(".video-only").forEach((element) => { element.hidden = state.mode !== "video"; });
    $("videoTimeline").hidden = state.mode !== "video";
    renderAssets();
    renderLayers();
    renderClips();
    renderInspector();
    draw();
    document.querySelectorAll("[data-project-not-found]").forEach((element) => {
      element.hidden = !projectMissing;
    });
    document.querySelectorAll("input, textarea, button, select").forEach((element) => {
      element.disabled = projectMissing;
    });
  };

  const addFiles = async (files) => {
    if (projectMissing) {
      notify("Projectが見つからないため素材を追加できません");
      return;
    }
    const accepted = Array.from(files || []).filter((file) =>
      file && (file.type.startsWith("image/") || file.type.startsWith("video/"))
    );
    if (!accepted.length) return;
    for (const file of accepted) {
      const kind = file.type.startsWith("video/") ? "video" : "image";
      const asset = normalizeAsset({
        id: uid("asset"),
        name: safeName(file.name),
        kind,
        mime: file.type,
        size: file.size,
        hasBlob: true,
      });
      attachBlob(asset, file);
      state.assets.push(asset);
      await updateAssetDimensions(asset);
      if (kind === "video") {
        state.clips.push({ id: uid("clip"), assetId: asset.id, name: asset.name, in: 0, out: 20 });
      }
      state.selectedAsset = asset.id;
      state.mode = kind;
      let layer = state.layers.find((candidate) => candidate.assetId === asset.id);
      if (!layer) {
        layer = { id: uid("layer"), assetId: asset.id, name: asset.name, visible: true };
        state.layers.unshift(layer);
      }
      state.selectedLayer = layer.id;
    }
    render();
  };

  $("projectTitle").addEventListener("input", (event) => {
    state.title = text(event.target.value, baseState.title, 100);
  });
  document.querySelectorAll(".mode-tab").forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode === "video" ? "video" : "image";
      render();
    });
  });
  $("assetInput").addEventListener("change", async (event) => {
    await addFiles(event.target.files);
    event.target.value = "";
  });
  [$("assetList"), document.querySelector(".canvas-stage")].filter(Boolean).forEach((target) => {
    target.addEventListener("dragover", (event) => event.preventDefault());
    target.addEventListener("drop", async (event) => {
      event.preventDefault();
      await addFiles(event.dataTransfer?.files);
    });
  });
  $("addLayer").addEventListener("click", () => {
    if (projectMissing) return notify("Projectが見つからないため変更できません");
    const asset = state.assets.find((candidate) => candidate.id === state.selectedAsset) || state.assets[0];
    if (!asset) return notify("先に素材を追加してください");
    const layer = { id: uid("layer"), assetId: asset.id, name: asset.name, visible: true };
    state.layers.unshift(layer);
    state.selectedLayer = layer.id;
    render();
  });
  $("addClip").addEventListener("click", () => {
    if (projectMissing) return notify("Projectが見つからないため変更できません");
    const asset = state.assets.find((candidate) => candidate.kind === "video") || state.assets[0];
    if (!asset || asset.kind !== "video") return notify("先に動画素材を追加してください");
    state.clips.push({ id: uid("clip"), assetId: asset.id, name: `${asset.name} · Clip`, in: 0, out: 20 });
    renderClips();
  });
  ["brightness", "contrast", "saturation"].forEach((key) => {
    $(key).addEventListener("input", (event) => {
      state.adjustments[key] = number(event.target.value, 0, -100, 100);
      $(`${key}Value`).textContent = String(state.adjustments[key]);
      draw();
    });
  });
  [["transformX", "x", -4096, 4096], ["transformY", "y", -4096, 4096], ["transformScale", "scale", 0.1, 8], ["transformRotation", "rotation", -360, 360]].forEach(([id, key, min, max]) => {
    $(id).addEventListener("input", (event) => {
      state.transform[key] = number(event.target.value, key === "scale" ? 1 : 0, min, max);
      draw();
    });
  });
  $("resetTransform").addEventListener("click", () => {
    state.transform = { x: 0, y: 0, scale: 1, rotation: 0, crop: "Canvas全体" };
    renderInspector();
    draw();
  });
  $("fitCanvas").addEventListener("click", draw);
  $("previewQuality").addEventListener("change", (event) => { state.preview.quality = event.target.value; });
  $("loopPreview").addEventListener("change", (event) => { state.preview.loop = event.target.checked; draw(); });
  $("includeAudio").addEventListener("change", (event) => { state.preview.audio = event.target.checked; draw(); });
  $("audioStart").addEventListener("input", (event) => {
    const clip = selectedVideoClip();
    const currentEnd = clip ? clip.out : state.audio.end;
    const start = number(event.target.value, 0, 0, Math.max(0, currentEnd - 0.1));
    if (clip) clip.in = start;
    else state.audio.start = start;
    renderInspector();
    const video = $("videoPreview");
    if (!video.paused) video.currentTime = currentVideoRange().start;
    draw();
  });
  $("audioEnd").addEventListener("input", (event) => {
    const clip = selectedVideoClip();
    const currentStart = clip ? clip.in : state.audio.start;
    const end = number(event.target.value, 20, Math.min(60, currentStart + 0.1), 60);
    if (clip) clip.out = end;
    else state.audio.end = end;
    renderInspector();
    draw();
  });
  $("saveLocal").addEventListener("click", saveLocal);
  $("exportJson").addEventListener("click", () => {
    download(`${safeName(state.title)}.json`, JSON.stringify(serialize(), null, 2), "application/json");
  });
  $("importJson").addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const incoming = JSON.parse(reader.result);
        if (incoming.kind !== "pixieed-visual-project" || incoming.version !== 1) throw new Error("unsupported");
        objectUrls.forEach((url) => URL.revokeObjectURL(url));
        objectUrls.clear();
        Object.assign(state, normalizeState(incoming), { selectedAsset: null, selectedLayer: null });
        render();
        await hydrateAssets();
        notify("JSONプロジェクトを読み込みました（保存済み素材を再接続中）");
      } catch (_error) {
        notify("読み込めるVisual Project JSONではありません");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  });
  $("exportPng").addEventListener("click", async () => {
    const canvas = $("creativeCanvas");
    const video = $("videoPreview");
    const asset = state.assets.find((candidate) => candidate.id === state.selectedAsset);
    let restoreVideoTime = null;
    let restoreVideoPlayback = false;
    if (asset?.kind === "video") {
      if (video.hidden || video.readyState < 2) {
        notify("動画を読み込めないためPNGを書き出せません");
        return;
      }
      restoreVideoTime = video.currentTime;
      restoreVideoPlayback = !video.paused;
      video.pause();
      const sought = await seekVideo(video, currentVideoRange().start);
      if (!sought) {
        notify("Clipの開始位置へ移動できないためPNGを書き出せません");
        return;
      }
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#1b1d22";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      paintSource(ctx, video, video.videoWidth || asset.width, video.videoHeight || asset.height);
    }
    canvas.toBlob((blob) => {
      if (!blob) return notify("PNGを書き出せませんでした");
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `${safeName(state.title)}.png`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      if (restoreVideoTime !== null) {
        void seekVideo(video, restoreVideoTime).then(() => {
          if (restoreVideoPlayback) video.play().catch(() => {});
        });
      }
      notify("PNGを書き出しました");
    }, "image/png");
  });
  const exportVideoAsWebm = async ({ downloadResult = true } = {}) => {
    const canvas = $("creativeCanvas");
    const video = $("videoPreview");
    const asset = state.assets.find((candidate) => candidate.id === state.selectedAsset);
    if (exportingVideo) return;
    if (asset?.kind !== "video" || video.hidden || video.readyState < 2) {
      notify("動画を読み込めないためWebMを書き出せません");
      return;
    }
    if (typeof canvas.captureStream !== "function" || typeof MediaRecorder === "undefined") {
      notify("このブラウザはWebM書き出しに対応していません");
      return;
    }
    const mimeType = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ].find((candidate) => MediaRecorder.isTypeSupported(candidate));
    if (!mimeType) {
      notify("利用できるWebMエンコーダーがありません");
      return;
    }
    const range = currentVideoRange();
    const previousTime = video.currentTime;
    const previousPaused = video.paused;
    const previousLoop = video.loop;
    const previousMuted = video.muted;
    const duration = Number.isFinite(video.duration) && video.duration > 0
      ? Math.min(range.end, video.duration)
      : range.end;
    if (duration <= range.start + 0.05) {
      notify("書き出せるClip範囲がありません");
      return;
    }
    const output = canvas.captureStream(30);
    let sourceStream = null;
    if (state.preview.audio && typeof video.captureStream === "function") {
      sourceStream = video.captureStream();
      sourceStream.getAudioTracks().forEach((track) => output.addTrack(track));
    }
    const recorder = new MediaRecorder(output, { mimeType });
    const chunks = [];
    exportingVideo = true;
    $("exportVideo").disabled = true;
    video.pause();
    video.loop = false;
    video.muted = !state.preview.audio;
    const stopTracks = () => {
      output.getTracks().forEach((track) => track.stop());
      sourceStream?.getVideoTracks().forEach((track) => track.stop());
    };
    const restore = () => {
      exportingVideo = false;
      $("exportVideo").disabled = false;
      video.loop = previousLoop;
      video.muted = previousMuted;
      void seekVideo(video, previousTime).then(() => {
        if (!previousPaused) video.play().catch(() => {});
      });
    };
    const blob = await new Promise((resolve, reject) => {
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunks.push(event.data);
      };
      recorder.onerror = () => reject(new Error("MediaRecorder failed"));
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
      const finish = () => {
        if (recorder.state !== "inactive") recorder.stop();
      };
      const paint = () => {
        if (video.ended || video.currentTime >= duration - 0.02) {
          finish();
          return;
        }
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#1b1d22";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        paintSource(ctx, video, video.videoWidth || asset.width, video.videoHeight || asset.height);
        window.requestAnimationFrame(paint);
      };
      void seekVideo(video, range.start).then((sought) => {
        if (!sought) {
          reject(new Error("Clip start is unavailable"));
          return;
        }
        recorder.start(100);
        video.play().then(() => window.requestAnimationFrame(paint)).catch(reject);
      });
    }).catch((error) => {
      notify(error instanceof Error ? error.message : "WebMを書き出せませんでした");
      return null;
    }).finally(() => {
      stopTracks();
      restore();
    });
    if (!(blob instanceof Blob) || blob.size === 0) return;
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `${safeName(state.title)}.webm`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
    if (downloadResult) notify("ClipをWebMで書き出しました");
    return blob;
  };
  const canvasBlob = (canvas, type) => new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type);
  });
  const handoffToMarket = async () => {
    if (projectMissing) {
      notify("Projectが見つからないためMarketへ渡せません");
      return;
    }
    const transfer = window.PiXiEEDCreatorMarketTransfer;
    if (!transfer || typeof transfer.put !== "function") {
      notify("Marketへの引き渡し機能を読み込めませんでした");
      return;
    }
    const asset = state.assets.find((candidate) => candidate.id === state.selectedAsset);
    if (!asset || !(asset.file instanceof Blob)) {
      notify("Marketへ渡す素材ファイルを先に保存してください");
      return;
    }
    const button = $("marketButton");
    if (button) button.disabled = true;
    try {
      await saveLocal();
      let output;
      let outputName;
      if (asset.kind === "video") {
        output = await exportVideoAsWebm({ downloadResult: false });
        outputName = `${safeName(state.title)}.webm`;
      } else {
        draw();
        output = await canvasBlob($("creativeCanvas"), "image/png");
        outputName = `${safeName(state.title)}.png`;
      }
      if (!(output instanceof Blob) || output.size === 0) {
        notify("Marketへ渡す書き出し結果を作成できませんでした");
        return;
      }
      const projectFile = new File(
        [JSON.stringify(serialize(), null, 2)],
        `${safeName(state.title)}.visual.json`,
        { type: "application/json" },
      );
      const deliveryManifest = {
        schemaVersion: 1,
        manifestId: `visual:${projectId}:${asset.id}:${asset.revisionId || renderVersion}`,
        selectionKind: "MIXED_BUNDLE",
        project: {
          projectId,
          name: state.title,
          ...(asset.revisionId ? { revisionId: asset.revisionId } : {}),
        },
        entries: [
          {
            entryId: `visual-output:${asset.id}`,
            sourceKind: "VISUAL",
            source: {
              projectId,
              assetId: asset.id,
              revisionId: asset.revisionId,
              contentHash: asset.contentHash,
              fileName: outputName,
              mimeType: output.type,
              byteLength: output.size,
              path: outputName,
            },
            selection: { kind: "CONTENT", label: asset.kind === "video" ? "動画出力" : "画像出力", locator: outputName },
            provenance: { originKind: "LOCAL_PROJECT", rightsStatus: "CREATOR_DECLARATION_REQUIRED" },
            capabilities: { editable: false, animation: asset.kind === "video", targets: ["VISUAL", "MARKET"] },
            dependencyIds: [`visual-project:${projectFile.name}`],
          },
          {
            entryId: `visual-project:${projectFile.name}`,
            sourceKind: "VISUAL",
            source: { projectId, assetId: asset.id, fileName: projectFile.name, mimeType: projectFile.type, byteLength: projectFile.size, path: projectFile.name },
            selection: { kind: "PROJECT", label: "Visual Project", locator: projectFile.name },
            provenance: { originKind: "LOCAL_PROJECT", rightsStatus: "CREATOR_DECLARATION_REQUIRED" },
            capabilities: { editable: true, animation: true, targets: ["VISUAL", "MARKET"] },
            dependencyIds: [],
          },
        ],
        dependencies: [{ dependencyId: `visual-project:${projectFile.name}`, entryId: `visual-output:${asset.id}`, required: true, reason: "編集用Visual Project" }],
        summary: { entryCount: 2, sourceKinds: ["VISUAL"], labels: ["画像・動画出力", "Visual Project"] },
        createdAt: new Date().toISOString(),
      };
      const transferId = await transfer.put({
        entries: [
          { file: new File([output], outputName, { type: output.type || (asset.kind === "video" ? "video/webm" : "image/png") }), path: outputName },
          { file: projectFile, path: projectFile.name },
        ],
        metadata: { kind: "visual", projectId, assetId: asset.id, deliveryManifest },
      });
      const url = new URL("../../market/sell.html", window.location.href);
      url.searchParams.set("project_transfer", transferId);
      window.location.assign(url.href);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Marketへの引き渡しに失敗しました");
      if (button) button.disabled = false;
    }
  };
  $("exportVideo").addEventListener("click", () => { void exportVideoAsWebm(); });
  $("marketButton").addEventListener("click", () => { void handoffToMarket(); });
  $("previewButton").addEventListener("click", () => {
    const video = $("videoPreview");
    if (state.mode === "video" && !video.hidden) {
      video.currentTime = currentVideoRange().start;
      video.loop = state.preview.loop;
      video.muted = !state.preview.audio;
      video.play().catch(() => notify("Previewの再生には画面上の再生操作が必要です"));
      notify("動画Previewを再生しました");
      return;
    }
    notify("画像Previewを更新しました");
  });

  $("videoPreview").addEventListener("timeupdate", (event) => {
    const video = event.currentTarget;
    const range = currentVideoRange();
    if (exportingVideo) return;
    if (!(video instanceof HTMLVideoElement) || video.currentTime < range.end) return;
    video.pause();
    if (state.preview.loop) {
      video.currentTime = range.start;
      video.play().catch(() => {});
    }
  });

  render();
  hydrateAssets();
  if (projectMissing && projectStore && typeof projectStore.hydrateWorkspaceProject === "function") {
    projectStore.hydrateWorkspaceProject(projectId).then((project) => {
      if (!project) return;
      projectMissing = false;
      render();
      void hydrateAssets();
      notify("Draw2のProjectを読み込みました");
    }).catch(() => {});
  }
})();
