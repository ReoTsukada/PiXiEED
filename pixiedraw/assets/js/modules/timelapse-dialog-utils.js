(() => {
  if (typeof window === 'undefined') return;
  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createTimelapseDialogUtils({
    getProjectId = () => '',
    onStatus = () => {},
    buildGifFromPixels = null,
    triggerDownloadFromBlob = null,
    getExportFileName = () => 'pixieedraw-timelapse.gif',
  } = {}) {
    const store = root.timelapseOperationStore?.createTimelapseOperationStore?.();
    const replay = root.timelapseReplayUtils?.createTimelapseReplayUtils?.();
    let steps = [];
    let position = 0;
    let timer = 0;
    let speed = 1;
    let exporting = false;
    let exportCancelled = false;
    const scratchCanvas = document.createElement('canvas');
    let presentationSize = { width: 1, height: 1 };

    const elements = {
      dialog: document.getElementById('timelapseDialog'),
      open: document.getElementById('openTimelapse'),
      canvas: document.getElementById('timelapseCanvas'),
      range: document.getElementById('timelapsePosition'),
      count: document.getElementById('timelapseStepCount'),
      play: document.getElementById('playTimelapse'),
      stop: document.getElementById('stopTimelapse'),
      restart: document.getElementById('restartTimelapse'),
      export: document.getElementById('exportTimelapse'),
      speed: document.getElementById('timelapseSpeed'),
      speedValue: document.getElementById('timelapseSpeedValue'),
      status: document.getElementById('timelapseStatus'),
    };

    function setStatus(message) {
      if (elements.status) elements.status.textContent = message;
    }

    function setSpeed(value) {
      speed = Math.max(0.25, Math.min(4, Number(value) || 1));
      if (elements.speed) elements.speed.value = String(speed);
      if (elements.speedValue) elements.speedValue.textContent = `${speed.toFixed(speed % 1 ? 2 : 1)}×`;
    }

    function stop() {
      if (exporting) {
        exportCancelled = true;
        return;
      }
      if (timer) window.clearTimeout(timer);
      timer = 0;
      if (elements.play) elements.play.disabled = steps.length <= 1;
      if (elements.stop) elements.stop.disabled = true;
    }

    function renderPosition(nextPosition) {
      if (!steps.length || !replay || !(elements.canvas instanceof HTMLCanvasElement)) return;
      position = Math.max(0, Math.min(steps.length - 1, Math.round(Number(nextPosition) || 0)));
      renderStepToCanvas(steps[position], elements.canvas);
      if (elements.range) elements.range.value = String(position);
      if (elements.count) elements.count.textContent = `${position} / ${Math.max(0, steps.length - 1)}`;
    }

    function renderStepToCanvas(step, targetCanvas) {
      if (!step || !(targetCanvas instanceof HTMLCanvasElement)) return { width: 1, height: 1 };
      replay.renderSnapshotToCanvas(step.snapshot, scratchCanvas, { frameId: step.frameId });
      targetCanvas.width = presentationSize.width;
      targetCanvas.height = presentationSize.height;
      const context = targetCanvas.getContext('2d', { alpha: true });
      context.clearRect(0, 0, presentationSize.width, presentationSize.height);
      context.drawImage(
        scratchCanvas,
        Math.round(Number(step.presentationOffsetX) || 0),
        Math.round(Number(step.presentationOffsetY) || 0)
      );
      return presentationSize;
    }

    function getOpaqueBounds(canvas) {
      const width = Math.max(1, canvas.width);
      const height = Math.max(1, canvas.height);
      const pixels = canvas.getContext('2d', { alpha: true }).getImageData(0, 0, width, height).data;
      let left = width;
      let top = height;
      let right = -1;
      let bottom = -1;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          if (!pixels[((y * width + x) * 4) + 3]) continue;
          left = Math.min(left, x);
          top = Math.min(top, y);
          right = Math.max(right, x);
          bottom = Math.max(bottom, y);
        }
      }
      return right >= left && bottom >= top ? { left, top, right, bottom } : null;
    }

    function inferLegacyResizeOffset(beforeSnapshot, afterSnapshot, frameId) {
      const beforeCanvas = document.createElement('canvas');
      const afterCanvas = document.createElement('canvas');
      replay.renderSnapshotToCanvas(beforeSnapshot, beforeCanvas, { frameId });
      replay.renderSnapshotToCanvas(afterSnapshot, afterCanvas, { frameId });
      const before = getOpaqueBounds(beforeCanvas);
      const after = getOpaqueBounds(afterCanvas);
      if (!before || !after) return { x: 0, y: 0 };
      // Legacy records predate resize offsets. Canvas resize translates all
      // pixels uniformly, so matching opaque bounds restores the same visual
      // position without scaling. An empty canvas needs no offset.
      return { x: after.left - before.left, y: after.top - before.top };
    }

    function setExporting(nextExporting) {
      exporting = Boolean(nextExporting);
      if (elements.export) elements.export.disabled = exporting || steps.length <= 1;
      if (elements.play) elements.play.disabled = exporting || steps.length <= 1;
      if (elements.stop) {
        elements.stop.disabled = !exporting;
        elements.stop.textContent = exporting ? '中止' : '停止';
      }
      if (elements.restart) elements.restart.disabled = exporting;
      if (elements.range) elements.range.disabled = exporting || steps.length <= 1;
    }

    function getGifStepIndices() {
      const maxFrames = 240;
      if (steps.length <= maxFrames) return steps.map((_step, index) => index);
      const indices = [];
      for (let index = 0; index < maxFrames; index += 1) {
        indices.push(Math.round((index * (steps.length - 1)) / (maxFrames - 1)));
      }
      return Array.from(new Set(indices));
    }

    async function exportGif() {
      if (exporting || typeof buildGifFromPixels !== 'function' || typeof triggerDownloadFromBlob !== 'function') return false;
      if (steps.length <= 1) await load();
      if (steps.length <= 1) return false;
      stop();
      exportCancelled = false;
      setExporting(true);
      try {
        const indices = getGifStepIndices();
        const { width, height } = presentationSize;
        const outputCanvas = document.createElement('canvas');
        outputCanvas.width = width;
        outputCanvas.height = height;
        const outputContext = outputCanvas.getContext('2d', { alpha: true });
        const frameCanvas = document.createElement('canvas');
        const pixels = [];
        for (let index = 0; index < indices.length; index += 1) {
          if (exportCancelled) {
            setStatus('GIF出力を中止しました。');
            return;
          }
          const step = steps[indices[index]];
          renderStepToCanvas(step, frameCanvas);
          outputContext.clearRect(0, 0, width, height);
          outputContext.drawImage(frameCanvas, 0, 0);
          pixels.push(outputContext.getImageData(0, 0, width, height).data);
          if (index % 16 === 0) {
            setStatus(`GIFを準備中… ${index + 1} / ${indices.length}`);
            await new Promise(resolve => window.setTimeout(resolve, 0));
          }
        }
        if (exportCancelled) {
          setStatus('GIF出力を中止しました。');
          return;
        }
        setStatus('GIFをエンコード中…');
        await new Promise(resolve => window.setTimeout(resolve, 0));
        const gifBytes = buildGifFromPixels(pixels, pixels.map(() => Math.max(45, Math.round(180 / speed))), width, height, { loopCount: 0 });
        const filename = String(getExportFileName() || 'pixieedraw-timelapse.gif').replace(/\.gif$/i, '') + '.gif';
        await triggerDownloadFromBlob(new Blob([gifBytes], { type: 'image/gif' }), filename, { mimeType: 'image/gif' });
        setStatus(`透明GIFを出力しました（${indices.length} コマ）。${steps.length > indices.length ? ' 再生用の全操作から均等に抽出しています。' : ''}`);
        return true;
      } catch (error) {
        console.warn('[pixiedraw:timelapse] GIF export failed', error);
        setStatus('GIFを出力できませんでした。');
        onStatus('タイムラプスGIFを出力できませんでした。', 'warn');
        return false;
      } finally {
        setExporting(false);
      }
    }

    async function load() {
      stop();
      const projectId = String(getProjectId() || '').trim();
      if (!projectId || !store || !replay) {
        setStatus('タイムラプスの準備中です。描画を1回確定してから開いてください。');
        return false;
      }
      setStatus('タイムラプスを読み込んでいます…');
      // History commits intentionally keep IndexedDB off the pointer-up path.
      // A just-committed stroke must still be present when the user opens this
      // panel immediately afterwards.
      await store.flush?.(projectId);
      const baseline = await store.readBaseline(projectId);
      const events = await store.listActiveEvents(projectId);
      if (!baseline) {
        steps = [];
        setStatus('このプロジェクトには、まだ再生できる記録がありません。');
        return false;
      }
      let working = replay.clone(baseline);
      const getActiveFrameId = snapshot => {
        const canvas = Array.isArray(snapshot?.canvases)
          ? (snapshot.canvases.find(candidate => candidate?.id === snapshot.activeCanvasId) || snapshot.canvases[0])
          : snapshot;
        return String(canvas?.frames?.[Math.max(0, Math.round(Number(snapshot?.activeFrame) || 0))]?.id || canvas?.frames?.[0]?.id || '');
      };
      const resizeOffsets = [];
      steps = [{ snapshot: replay.clone(working), frameId: getActiveFrameId(working) }];
      for (const event of events) {
        const previousWorking = working;
        if (event.checkpointKey) {
          const checkpoint = await store.readOperationCheckpoint(projectId, event.checkpointKey);
          if (checkpoint) working = checkpoint;
        } else {
          replay.applyForwardDiff(working, event.forwardDiff);
        }
        steps.push({
          snapshot: replay.clone(working),
          frameId: String(event.forwardDiff?.frameId || event.metadata?.frameId || getActiveFrameId(working)),
        });
        const hasStoredResizeOffset = Object.prototype.hasOwnProperty.call(event.metadata || {}, 'resizeOffsetX')
          || Object.prototype.hasOwnProperty.call(event.metadata || {}, 'resizeOffsetY');
        const inferredOffset = event.metadata?.kind === 'resize-canvas' && !hasStoredResizeOffset
          ? inferLegacyResizeOffset(previousWorking, working, String(event.metadata?.frameId || getActiveFrameId(working)))
          : { x: 0, y: 0 };
        resizeOffsets.push({
          x: hasStoredResizeOffset ? Math.round(Number(event.metadata?.resizeOffsetX) || 0) : inferredOffset.x,
          y: hasStoredResizeOffset ? Math.round(Number(event.metadata?.resizeOffsetY) || 0) : inferredOffset.y,
        });
      }
      const sizingCanvas = document.createElement('canvas');
      const lastStep = steps[steps.length - 1];
      presentationSize = replay.renderSnapshotToCanvas(lastStep.snapshot, sizingCanvas, { frameId: lastStep.frameId });
      let futureOffsetX = 0;
      let futureOffsetY = 0;
      for (let index = steps.length - 1; index >= 0; index -= 1) {
        steps[index].presentationOffsetX = futureOffsetX;
        steps[index].presentationOffsetY = futureOffsetY;
        if (index > 0) {
          futureOffsetX += resizeOffsets[index - 1]?.x || 0;
          futureOffsetY += resizeOffsets[index - 1]?.y || 0;
        }
      }
      if (elements.range) {
        elements.range.max = String(Math.max(0, steps.length - 1));
        elements.range.disabled = steps.length <= 1;
      }
      position = 0;
      renderPosition(0);
      setStatus(events.length
        ? `有効な操作 ${events.length} 件を再生できます。Undoした操作は含みません。`
        : '基準状態のみです。描画を確定すると記録が追加されます。');
      if (elements.play) elements.play.disabled = steps.length <= 1;
      if (elements.export) elements.export.disabled = steps.length <= 1;
      return true;
    }

    function play() {
      if (steps.length <= 1) return;
      stop();
      if (position >= steps.length - 1) renderPosition(0);
      if (elements.play) elements.play.disabled = true;
      if (elements.stop) elements.stop.disabled = false;
      const advance = () => {
        if (!timer) return;
        renderPosition(position + 1);
        if (position >= steps.length - 1) {
          stop();
          return;
        }
        timer = window.setTimeout(advance, Math.max(45, Math.round(180 / speed)));
      };
      timer = window.setTimeout(advance, Math.max(45, Math.round(180 / speed)));
    }

    function setup() {
      if (!(elements.dialog instanceof HTMLDialogElement)) return;
      elements.open?.addEventListener('click', async () => {
        try {
          elements.dialog.showModal();
          await load();
        } catch (error) {
          console.warn('[pixiedraw:timelapse] replay load failed', error);
          setStatus('タイムラプスを読み込めませんでした。');
          onStatus('タイムラプスを読み込めませんでした。', 'warn');
        }
      });
      elements.range?.addEventListener('input', () => renderPosition(elements.range.value));
      elements.speed?.addEventListener('input', () => setSpeed(elements.speed.value));
      elements.play?.addEventListener('click', play);
      elements.stop?.addEventListener('click', stop);
      elements.restart?.addEventListener('click', () => { stop(); renderPosition(0); });
      elements.export?.addEventListener('click', exportGif);
      elements.dialog.addEventListener('close', stop);
      setSpeed(elements.speed?.value || 1);
    }

    return { setup, load, play, stop, exportGif };
  }

  root.timelapseDialogUtils = { createTimelapseDialogUtils };
})();
