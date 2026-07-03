(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createExportFormatWorkflowUtils(rawScope = {}) {
    const scope = new Proxy(rawScope, {
      has() {
        return true;
      },
      get(target, key) {
        if (key === Symbol.unscopables) {
          return undefined;
        }
        if (Object.prototype.hasOwnProperty.call(target, key)) {
          return target[key];
        }
        return globalThis[key];
      },
      set(target, key, value) {
        if (Object.prototype.hasOwnProperty.call(target, key)) {
          target[key] = value;
          return true;
        }
        globalThis[key] = value;
        return true;
      },
    });

    return ((scope) => {
      with (scope) {
  async function exportProjectAsGridPng() {
    if (!ensureCurrentClientCanExportProject({ announce: true, format: 'gridpng' })) {
      return;
    }
    const exportFrames = getCurrentExportFrames();
    const frameCount = exportFrames.length;
    if (!frameCount) {
      updateAutosaveStatus('グリッド分割で書き出すフレームがありません', 'warn');
      return;
    }
    try {
      const selectedFrameIndex = clamp(Math.round(Number(state.activeFrame) || 0), 0, Math.max(0, frameCount - 1));
      const candidates = getExportScaleCandidates();
      const selectedScale = applyExportScaleConstraints(candidates);
      syncExportScaleInputs();
      const colorSpriteArea = buildColorSpriteAppendAreaForCurrentExport('gridpng');
      exportGridTileWidth = normalizeExportGridTileSize(exportGridTileWidth, 8);
      exportGridTileHeight = normalizeExportGridTileSize(exportGridTileHeight, 8);
      syncExportGridInputs();
      const firstStillFrame = appendColorSpriteAreaToStillFrameSet(
        buildStillExportFrameSet(selectedFrameIndex),
        'gridpng',
        colorSpriteArea
      );
      // Grid split size is defined in source pixels, then mapped to export scale.
      // This keeps tile count stable even when export scale is > 1.
      const rowSegments = buildGridRowSegmentsTopToBottom(firstStillFrame.height, exportGridTileHeight);
      const columnSegments = buildGridColumnSegmentsRightToLeft(firstStillFrame.width, exportGridTileWidth);
      const tileCountPerFrame = rowSegments.length * columnSegments.length;
      if (!tileCountPerFrame) {
        updateAutosaveStatus('分割サイズの設定が無効です', 'warn');
        return;
      }
      const total = tileCountPerFrame * frameCount;
      const rowDigits = Math.max(2, String(rowSegments.length).length);
      const columnDigits = Math.max(2, String(columnSegments.length).length);
      const tasks = [];

      for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
        const stillFrame = appendColorSpriteAreaToStillFrameSet(
          buildStillExportFrameSet(frameIndex),
          'gridpng',
          colorSpriteArea
        );
        const { width, height, pixels } = stillFrame;
        const frameCanvas = createFrameCanvas(pixels, width, height);
        const outputCanvas = scaleCanvasNearestNeighbor(frameCanvas, selectedScale);
        for (let rowIndex = 0; rowIndex < rowSegments.length; rowIndex += 1) {
          const rowSegment = rowSegments[rowIndex];
          const rowNumber = String(rowIndex + 1).padStart(rowDigits, '0');
          for (let columnIndex = 0; columnIndex < columnSegments.length; columnIndex += 1) {
            const columnSegment = columnSegments[columnIndex];
            const columnNumber = String(columnIndex + 1).padStart(columnDigits, '0');
            const exportX = columnSegment.start * selectedScale;
            const exportY = rowSegment.start * selectedScale;
            const exportWidth = columnSegment.size * selectedScale;
            const exportHeight = rowSegment.size * selectedScale;
            const blob = await canvasRegionToBlob(
              outputCanvas,
              exportX,
              exportY,
              exportWidth,
              exportHeight,
              'image/png'
            );
            const suffixParts = [];
            if (frameCount > 1) {
              suffixParts.push(`frame_${String(frameIndex + 1).padStart(2, '0')}`);
            }
            suffixParts.push(`r${rowNumber}`, `c${columnNumber}`);
            if (selectedScale > 1) {
              suffixParts.push(`x${selectedScale}`);
            }
            const suffix = suffixParts.join('_');
            tasks.push({
              blob,
              filename: createExportFileName('png', suffix),
              shareText: `グリッド分割PNGを書き出しました (F${frameIndex + 1} / r${rowIndex + 1}, c${columnIndex + 1})`,
            });
          }
        }
      }

      const result = await deliverExportTasks(tasks, {
        mimeType: 'image/png',
        fileExtensions: ['.png'],
        shareTitle: state.documentName || 'PiXiEEDraw',
        shareText: 'グリッド分割PNGを書き出しました',
        mode: 'gridpng',
        includeProjectCompanion: shouldSaveProjectCompanion('gridpng'),
        archiveSuffix: 'gridpng_frames',
        archiveShareText: shouldSaveProjectCompanion('gridpng')
          ? 'グリッド分割PNG一式と .pixieedraw を ZIP で書き出しました'
          : 'グリッド分割PNG一式をZIPで書き出しました',
      });
      const exportedCount = result.exportedCount;
      const wasCancelled = result.wasCancelled;
      const hadFailure = result.hadFailure;

      const detailParts = [];
      detailParts.push(`分割 ${exportGridTileWidth}×${exportGridTileHeight}px`);
      if (frameCount > 1) {
        detailParts.push(`全${frameCount}フレーム`);
        detailParts.push(`選択開始 ${selectedFrameIndex + 1}`);
      }
      if (selectedScale > 1) {
        detailParts.push(`倍率 ×${selectedScale}`);
      }
      if (colorSpriteArea) {
        detailParts.push(`カラースプライト ${colorSpriteArea.colorCount}色`);
      }
      detailParts.push(`右上→左 / 上→下`);
      const detail = detailParts.length ? ` (${detailParts.join(' / ')})` : '';

      if (exportedCount === total) {
        updateAutosaveStatus(`グリッド分割PNGを書き出しました${detail}`, 'success');
      } else if (wasCancelled) {
        const remaining = total - exportedCount;
        updateAutosaveStatus(remaining === total
          ? 'グリッド分割PNGの書き出しをキャンセルしました'
          : `グリッド分割PNGを書き出しましたが ${remaining} 件はキャンセルされました`, 'warn');
      } else if (exportedCount > 0 && hadFailure) {
        updateAutosaveStatus(`グリッド分割PNGを書き出しましたが ${total - exportedCount} 件エクスポートできませんでした`, 'warn');
      } else {
        updateAutosaveStatus('グリッド分割PNGの書き出しに失敗しました', 'error');
      }

      if (exportedCount > 0) {
        markDocumentDurablySaved();
        if (exportedCount === total && !wasCancelled && !hadFailure) {
          const companionResult = shouldSaveProjectCompanion('gridpng')
            ? 'saved'
            : await maybeSaveProjectCompanionAfterExport('gridpng', {
              exportedCount,
              wasCancelled,
            });
          announceProjectCompanionSaveResult('gridpng', companionResult);
        }
        showLoginPromptAfterExport();
      }
    } catch (error) {
      console.error('Grid PNG export failed', error);
      updateAutosaveStatus('グリッド分割PNGの書き出しに失敗しました', 'error');
    }
  }

  async function exportProjectAsPng() {
    if (!ensureCurrentClientCanExportProject({ announce: true, format: 'png' })) {
      return;
    }
    const frameCount = getCurrentExportFrames().length;
    if (!frameCount) {
      updateAutosaveStatus('PNGを書き出すフレームがありません', 'warn');
      return;
    }
    try {
      const isVoxelComposite = isVoxelExtensionModeEnabled();
      const candidates = getExportScaleCandidates();
      const selectedScale = applyExportScaleConstraints(candidates);
      syncExportScaleInputs();
      const includeOriginal = shouldExportOriginalCompanion('png', selectedScale);
      const colorSpriteArea = buildColorSpriteAppendAreaForCurrentExport('png');
      const tasks = [];
      for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
        const stillFrame = appendColorSpriteAreaToStillFrameSet(
          buildStillExportFrameSet(frameIndex),
          'png',
          colorSpriteArea
        );
        const { width, height, pixels } = stillFrame;
        const baseCanvas = createFrameCanvas(pixels, width, height);
        const variants = [{ scale: selectedScale, isOriginal: false }];
        if (includeOriginal) {
          variants.push({ scale: 1, isOriginal: true });
        }
        for (let variantIndex = 0; variantIndex < variants.length; variantIndex += 1) {
          const variant = variants[variantIndex];
          const outputCanvas = scaleCanvasNearestNeighbor(baseCanvas, variant.scale);
          const blob = await canvasToBlob(outputCanvas, 'image/png');
          if (!blob) {
            throw new Error('Failed to create PNG blob');
          }
          let suffix = frameCount > 1 ? `frame_${String(frameIndex + 1).padStart(2, '0')}` : '';
          if (variant.scale > 1 || includeOriginal) {
            suffix = suffix ? `${suffix}_x${variant.scale}` : `x${variant.scale}`;
          }
          tasks.push({
            blob,
            filename: createExportFileName('png', suffix),
            shareText: `フレーム${frameIndex + 1}のPNGを書き出しました${variant.scale > 1 ? ` (×${variant.scale})` : ''}`,
          });
        }
      }

      const result = await deliverExportTasks(tasks, {
        mimeType: 'image/png',
        fileExtensions: ['.png'],
        shareTitle: state.documentName || 'PiXiEEDraw',
        shareText: isVoxelComposite ? 'PNGを書き出しました（立体表示）' : 'PNGを書き出しました',
        mode: 'png',
        includeProjectCompanion: shouldSaveProjectCompanion('png'),
        archiveSuffix: 'png_frames',
        archiveShareText: shouldSaveProjectCompanion('png')
          ? (isVoxelComposite ? 'PNG一式と .pixieedraw を ZIP で書き出しました（立体表示）' : 'PNG一式と .pixieedraw を ZIP で書き出しました')
          : (isVoxelComposite ? 'PNG一式をZIPで書き出しました（立体表示）' : 'PNG一式をZIPで書き出しました'),
      });
      const detailParts = [];
      if (frameCount > 1) {
        detailParts.push(`全${frameCount}フレーム`);
      }
      if (isVoxelComposite) {
        detailParts.push(localizeText('立体表示', 'Voxel View'));
      }
      if (selectedScale > 1) {
        detailParts.push(`×${selectedScale}`);
      }
      if (includeOriginal) {
        detailParts.push('原寸も追加');
      }
      if (colorSpriteArea) {
        detailParts.push(`カラースプライト ${colorSpriteArea.colorCount}色`);
      }
      const detail = detailParts.length ? ` (${detailParts.join(' / ')})` : '';

      if (result.exportedCount === result.total) {
        updateAutosaveStatus(`PNGを書き出しました${detail}`, 'success');
      } else if (result.wasCancelled) {
        const remaining = result.total - result.exportedCount;
        updateAutosaveStatus(remaining === result.total
          ? 'PNGの書き出しをキャンセルしました'
          : `PNGを書き出しましたが ${remaining} 件はキャンセルされました`, 'warn');
      } else if (result.exportedCount > 0 && result.hadFailure) {
        updateAutosaveStatus(`PNGを書き出しましたが ${result.total - result.exportedCount} 件エクスポートできませんでした`, 'warn');
      } else {
        updateAutosaveStatus('PNGの書き出しに失敗しました', 'error');
      }
      if (result.exportedCount > 0) {
        markDocumentDurablySaved();
        let skipInterstitial = false;
        if (result.exportedCount === result.total && !result.wasCancelled && !result.hadFailure) {
          const companionResult = shouldSaveProjectCompanion('png')
            ? 'saved'
            : await maybeSaveProjectCompanionAfterExport('png', {
              exportedCount: result.exportedCount,
              wasCancelled: result.wasCancelled,
            });
          announceProjectCompanionSaveResult('png', companionResult);
          skipInterstitial = await maybeRedirectToContestPostAfterExport('png', {
            primaryBlob: tasks[0]?.blob || null,
            companionResult,
          });
        }
        if (!skipInterstitial) {
          showLoginPromptAfterExport();
        }
      }
    } catch (error) {
      console.error('PNG export failed', error);
      updateAutosaveStatus('PNGの書き出しに失敗しました', 'error');
    }
  }

  async function exportProjectAsVoxelPreviewPng() {
    if (!ensureCurrentClientCanExportProject({ announce: true, format: 'voxelpreview' })) {
      return;
    }
    if (!(voxelExtensionPreviewPixels instanceof Uint8ClampedArray) || !voxelExtensionPreviewMeta) {
      updateAutosaveStatus(localizeText('立体プレビューを書き出せません', 'Voxel preview is not available for export'), 'warn');
      return;
    }
    try {
      const width = Math.max(1, Math.round(Number(voxelExtensionPreviewMeta.width) || 1));
      const height = Math.max(1, Math.round(Number(voxelExtensionPreviewMeta.height) || 1));
      const candidates = getExportScaleCandidates('voxelpreview');
      const selectedScale = applyExportScaleConstraints(candidates);
      syncExportScaleInputs();
      const baseCanvas = createFrameCanvas(voxelExtensionPreviewPixels, width, height);
      const outputCanvas = scaleCanvasNearestNeighbor(baseCanvas, selectedScale);
      const blob = await canvasToBlob(outputCanvas, 'image/png');
      if (!blob) {
        throw new Error('Failed to create voxel preview PNG blob');
      }
      const suffix = selectedScale > 1 ? `voxel_preview_x${selectedScale}` : 'voxel_preview';
      const tasks = [{
        blob,
        filename: createExportFileName('png', suffix),
        shareText: localizeText('立体プレビューPNGを書き出しました', 'Exported voxel preview PNG'),
      }];
      const result = await deliverExportTasks(tasks, {
        mimeType: 'image/png',
        fileExtensions: ['.png'],
        shareTitle: state.documentName || 'PiXiEEDraw',
        shareText: localizeText('立体プレビューPNGを書き出しました', 'Exported voxel preview PNG'),
        mode: 'voxelpreview',
      });
      if (result.exportedCount > 0) {
        updateAutosaveStatus(
          localizeText(
            selectedScale > 1 ? `立体プレビューPNGを書き出しました (×${selectedScale})` : '立体プレビューPNGを書き出しました',
            selectedScale > 1 ? `Exported voxel preview PNG (x${selectedScale})` : 'Exported voxel preview PNG'
          ),
          'success'
        );
        markDocumentDurablySaved();
        showLoginPromptAfterExport();
      } else if (result.wasCancelled) {
        updateAutosaveStatus(localizeText('立体プレビューPNGの書き出しをキャンセルしました', 'Voxel preview PNG export was canceled'), 'warn');
      } else {
        updateAutosaveStatus(localizeText('立体プレビューPNGの書き出しに失敗しました', 'Voxel preview PNG export failed'), 'error');
      }
    } catch (error) {
      console.error('Voxel preview PNG export failed', error);
      updateAutosaveStatus(localizeText('立体プレビューPNGの書き出しに失敗しました', 'Voxel preview PNG export failed'), 'error');
    }
  }


        return Object.freeze({
        exportProjectAsGridPng,
        exportProjectAsPng,
        exportProjectAsVoxelPreviewPng,
        });
      }
    })(scope);
  }

  root.exportFormatWorkflowUtils = Object.freeze({
    createExportFormatWorkflowUtils,
  });
})();
