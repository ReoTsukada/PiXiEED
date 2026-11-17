import {
  DEFAULT_AI_SETTINGS,
  SETTINGS_VERSION,
  buildAIProductionPrompt,
  normalizeAISettings,
} from "./pixel-art-settings.mjs";
import { getPixelArtGuide } from "./pixel-art-guide.mjs";
import { EXPRESSION_FIELDS, normalizeExpression } from "./pixel-art-expression.mjs";
import { selectPixelArtTechniques } from "./pixel-art-techniques.mjs";
import { reviewPixelArt } from "./pixel-art-review.mjs";
import { pixelArtToRgba } from "./pixel-art-contract.mjs";

const STORAGE_KEY = "pixieed:ai-production-settings:v1";
const MAX_JSON_BYTES = 32 * 1024;

const form = document.querySelector("#ai-settings-form");
const status = document.querySelector("#settings-status");
const promptOutput = document.querySelector("#settings-prompt");
const guideOutput = document.querySelector("#settings-guide");
const techniqueOutput = document.querySelector("#settings-techniques");
const reviewStatus = document.querySelector("#review-status");
const reviewOutput = document.querySelector("#review-result");
const reviewArtFile = document.querySelector("#review-art-file");
const reviewBeforeFile = document.querySelector("#review-before-file");
const reviewArtCanvas = document.querySelector("#review-current-canvas");
const reviewBeforeCanvas = document.querySelector("#review-before-canvas");
const reviewArtZoomCanvas = document.querySelector("#review-current-zoom-canvas");
const reviewBeforeZoomCanvas = document.querySelector("#review-before-zoom-canvas");
const reviewBeforeFigure = document.querySelector("#review-before-figure");
const reviewObserved = document.querySelector("#review-observed");
const reviewLocation = document.querySelector("#review-location");
const reviewProblem = document.querySelector("#review-problem");
const reviewCategory = document.querySelector("#review-category");
const reviewDecision = document.querySelector("#review-decision");
const reviewCopyButton = document.querySelector("#review-copy");
const importFileInput = document.querySelector("#settings-import-file");
const widthInput = document.querySelector("#settings-width");
const heightInput = document.querySelector("#settings-height");
const presetButtons = [...document.querySelectorAll("[data-size]")];
const materialInputs = [...form.querySelectorAll('input[name="materials"]')];
const expressionInputs = new Map();
const expressionWidthInput = document.querySelector("#expression-width");
const expressionHeightInput = document.querySelector("#expression-height");
const expressionBackgroundInput = document.querySelector("#expression-background");
const featureFields = {
  summary: document.querySelector("#settings-reference-summary"),
  mood: document.querySelector("#settings-reference-mood"),
  lighting: document.querySelector("#settings-reference-lighting"),
  edges: document.querySelector("#settings-reference-edges"),
  shading: document.querySelector("#settings-reference-shading"),
  detail: document.querySelector("#settings-reference-detail"),
  palette: document.querySelector("#settings-reference-palette"),
};

let reviewArt = null;
let reviewBeforeArt = null;
const reviewFileVersions = { art: 0, before: 0 };

function setStatus(message, state = "") {
  status.dataset.state = state;
  status.textContent = message;
}

function textElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = String(text ?? "");
  return element;
}

function initializeExpressionFields() {
  for (const field of EXPRESSION_FIELDS) {
    const select = document.querySelector(`#expression-${field.key}`);
    const label = document.querySelector(`#expression-label-${field.key}`);
    if (!select || !label) continue;
    label.textContent = field.label;
    select.replaceChildren(...field.options.map(({ value, label: optionLabel }) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = optionLabel;
      return option;
    }));
    expressionInputs.set(field.key, select);
  }
}

function expressionHasSpecificValue(expression) {
  return EXPRESSION_FIELDS.some(({ key }) => expression[key] !== "auto")
    || expression.occupancy !== undefined
    || expression.background !== undefined;
}

function collectExpression(width, height) {
  const input = Object.fromEntries(EXPRESSION_FIELDS.map(({ key }) => [key, expressionInputs.get(key)?.value ?? "auto"]));
  const occupiedWidth = expressionWidthInput.value;
  const occupiedHeight = expressionHeightInput.value;
  if (occupiedWidth !== "" || occupiedHeight !== "") {
    input.occupancy = { width: Number(occupiedWidth), height: Number(occupiedHeight) };
  }
  const background = expressionBackgroundInput.value.trim();
  if (background) input.background = background;
  const expression = normalizeExpression(input, width, height);
  return expressionHasSpecificValue(expression) ? expression : undefined;
}

function getOptionalReferenceStyle() {
  const summary = featureFields.summary.value;
  const mood = document.querySelector("#settings-reference-mood").value;
  const lighting = document.querySelector("#settings-reference-lighting").value;
  const edges = document.querySelector("#settings-reference-edges").value;
  const shading = document.querySelector("#settings-reference-shading").value;
  const detail = document.querySelector("#settings-reference-detail").value;
  const paletteText = featureFields.palette.value.trim();
  const palette = paletteText ? paletteText.split(/[\s,]+/).filter(Boolean) : [];
  const hasText = [summary, mood, lighting, edges, shading, detail].some((value) => value.trim());
  if (!hasText && !palette.length) return undefined;
  const derivedSummary = summary.trim() || [
    mood.trim() && `雰囲気: ${mood.trim()}`,
    lighting.trim() && `光: ${lighting.trim()}`,
    edges.trim() && `輪郭: ${edges.trim()}`,
    shading.trim() && `陰影: ${shading.trim()}`,
    detail.trim() && `細部: ${detail.trim()}`,
    palette.length && `代表色: ${palette.join(", ")}`,
  ].filter(Boolean).join("。").slice(0, 400) || "入力した参考特徴を反映する。";
  const referenceStyle = { status: "described_only", summary: derivedSummary };
  if (palette.length) referenceStyle.palette = palette;
  for (const [key, value] of Object.entries({ mood, lighting, edges, shading, detail })) {
    if (value.trim()) referenceStyle[key] = value.trim();
  }
  return referenceStyle;
}

function collectSettings() {
  const width = Number(widthInput.value);
  const height = Number(heightInput.value);
  const request = {
    subject: form.elements.subject.value,
    width,
    height,
    style: form.elements.style.value,
    materials: materialInputs.filter((input) => input.checked).map((input) => input.value),
    animated: form.elements.animated.checked,
    normalMap: form.elements.normalMap.checked,
  };
  const expression = collectExpression(width, height);
  if (expression) request.expression = expression;
  const referenceStyle = getOptionalReferenceStyle();
  if (referenceStyle) request.referenceStyle = referenceStyle;
  return normalizeAISettings({ version: SETTINGS_VERSION, request, direction: form.elements.direction.value });
}

function applySettings(settings) {
  const normalized = normalizeAISettings(settings);
  const request = normalized.request;
  form.elements.subject.value = request.subject;
  form.elements.style.value = request.style;
  widthInput.value = String(request.width);
  heightInput.value = String(request.height);
  form.elements.direction.value = normalized.direction;
  form.elements.animated.checked = request.animated;
  form.elements.normalMap.checked = request.normalMap;
  for (const input of materialInputs) input.checked = request.materials.includes(input.value);
  const expression = request.expression;
  for (const { key } of EXPRESSION_FIELDS) expressionInputs.get(key).value = expression?.[key] ?? "auto";
  expressionWidthInput.value = expression?.occupancy ? String(expression.occupancy.width) : "";
  expressionHeightInput.value = expression?.occupancy ? String(expression.occupancy.height) : "";
  expressionBackgroundInput.value = expression?.background ?? "";

  for (const field of ["summary", "mood", "lighting", "edges", "shading", "detail"]) {
    featureFields[field].value = request.referenceStyle?.[field] ?? "";
  }
  featureFields.palette.value = request.referenceStyle?.palette?.join(", ") ?? "";
  updatePresetState();
  invalidateReviewAssessment({ requireRecheck: true });
  renderCurrentSettings();
  return normalized;
}

function updatePresetState() {
  for (const button of presetButtons) {
    const selected = widthInput.value === button.dataset.size && heightInput.value === button.dataset.size;
    button.setAttribute("aria-pressed", String(selected));
  }
}

function renderGuide(guide) {
  const fragment = document.createDocumentFragment();
  const steps = document.createElement("section");
  steps.append(textElement("h4", "", "制作の手順"));
  const list = document.createElement("ul");
  for (const step of guide.steps) {
    const item = document.createElement("li");
    item.append(textElement("strong", "", step.title));
    item.append(document.createTextNode(` ${step.body}`));
    list.append(item);
  }
  steps.append(list);
  fragment.append(steps);

  for (const [title, items] of [["仕上がりの見直し", guide.reviewChecklist], ["知っておきたいこと", guide.limitations]]) {
    const section = document.createElement("section");
    section.append(textElement("h4", "", title));
    const listElement = document.createElement("ul");
    for (const item of items) listElement.append(textElement("li", "", item));
    section.append(listElement);
    fragment.append(section);
  }
  guideOutput.replaceChildren(fragment);
}

function appendList(parent, title, values) {
  if (!Array.isArray(values) || !values.length) return;
  parent.append(textElement("p", "", title));
  const list = document.createElement("ul");
  for (const value of values) list.append(textElement("li", "", value));
  parent.append(list);
}

function renderTechniques(techniques) {
  const fragment = document.createDocumentFragment();
  const selected = Array.isArray(techniques) ? techniques.slice(0, 6) : [];
  if (!selected.length) {
    fragment.append(textElement("p", "", "この設定に合う技法はありません。題材や条件を変えてください。"));
    techniqueOutput.replaceChildren(fragment);
    return;
  }
  for (const technique of selected) {
    const details = document.createElement("details");
    details.className = "ai-settings__technique";
    const summary = document.createElement("summary");
    summary.textContent = technique.title;
    details.append(summary);
    if (technique.appliesWhen) details.append(textElement("p", "", technique.appliesWhen));
    if (technique.avoidWhen) details.append(textElement("p", "", `使わない目安: ${technique.avoidWhen}`));
    appendList(details, "進め方", technique.steps);
    appendList(details, "確認する点", technique.checks);

    const links = document.createElement("div");
    links.className = "ai-settings__technique-links";
    for (const url of technique.sourceUrls ?? []) {
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== "https:") continue;
        const link = document.createElement("a");
        link.href = parsed.href;
        link.rel = "noopener";
        link.textContent = parsed.hostname;
        link.append(textElement("span", "ai-settings__visually-hidden", ` ${parsed.href}`));
        links.append(link);
      } catch { /* Ignore malformed catalog references. */ }
    }
    for (const caseId of technique.caseIds ?? []) {
      const link = document.createElement("a");
      link.href = `/ai/examples/#${encodeURIComponent(caseId)}`;
      link.textContent = "ユーザー採用例を見る";
      links.append(link);
    }
    for (const caseId of technique.comparisonCaseIds ?? []) {
      const link = document.createElement("a");
      link.href = `/ai/examples/#${encodeURIComponent(caseId)}`;
      link.textContent = "内部比較例を見る（未採用）";
      links.append(link);
    }
    if (links.childElementCount) details.append(links);
    fragment.append(details);
  }
  techniqueOutput.replaceChildren(fragment);
}

function drawPixelArtCanvas(canvas, imageData) {
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  canvas.style.width = `${imageData.width}px`;
  canvas.style.height = `${imageData.height}px`;
  canvas.dataset.empty = "false";
  const context = canvas.getContext("2d", { alpha: true });
  const pixels = context.createImageData(imageData.width, imageData.height);
  pixels.data.set(imageData.data);
  context.putImageData(pixels, 0, 0);
}

function drawReviewArt(art, originalCanvas, zoomCanvas) {
  const rgba = pixelArtToRgba(art);
  drawPixelArtCanvas(originalCanvas, rgba);
  drawPixelArtCanvas(zoomCanvas, rgba);
  const pair = zoomCanvas.parentElement.parentElement;
  const gap = Number.parseFloat(window.getComputedStyle(pair).columnGap) || 8;
  const availableWidth = Math.max(1, pair.clientWidth - rgba.width - gap);
  const scale = Math.max(1, Math.min(8, Math.floor(availableWidth / rgba.width), Math.floor(320 / rgba.height)));
  zoomCanvas.style.width = `${rgba.width * scale}px`;
  zoomCanvas.style.height = `${rgba.height * scale}px`;
}

function clearReviewCanvas(canvas) {
  canvas.width = 1;
  canvas.height = 1;
  canvas.style.removeProperty("width");
  canvas.style.removeProperty("height");
  canvas.dataset.empty = "true";
  canvas.getContext("2d")?.clearRect(0, 0, 1, 1);
}

function drawReviewCanvases() {
  if (reviewArt) drawReviewArt(reviewArt, reviewArtCanvas, reviewArtZoomCanvas);
  if (reviewBeforeArt) drawReviewArt(reviewBeforeArt, reviewBeforeCanvas, reviewBeforeZoomCanvas);
}

function setStatusReview(message, state = "") {
  reviewStatus.dataset.state = state;
  reviewStatus.textContent = message;
}

async function loadReviewArtFile(file, slot) {
  const version = ++reviewFileVersions[slot];
  invalidateReviewAssessment({ requireRecheck: true });
  if (slot === "art") {
    reviewArt = null;
    clearReviewCanvas(reviewArtCanvas);
    clearReviewCanvas(reviewArtZoomCanvas);
  } else {
    reviewBeforeArt = null;
    reviewBeforeFigure.hidden = true;
    clearReviewCanvas(reviewBeforeCanvas);
    clearReviewCanvas(reviewBeforeZoomCanvas);
  }
  reviewOutput.replaceChildren();
  reviewCopyButton.disabled = true;
  if (!file) return;
  if (file.size > MAX_JSON_BYTES) {
    setStatusReview("作品JSONは32KB以下のファイルを選んでください。", "error");
    return;
  }
  try {
    const parsed = JSON.parse(await file.text());
    reviewPixelArt({ art: parsed });
    if (version !== reviewFileVersions[slot]) return;
    if (slot === "art") reviewArt = parsed;
    else {
      reviewBeforeArt = parsed;
      reviewBeforeFigure.hidden = false;
    }
    drawReviewCanvases();
    setStatusReview(slot === "art" ? "完成データを読み込みました。原寸と拡大表示を確認してください。" : "修正前データを読み込みました。", "success");
  } catch (error) {
    if (version !== reviewFileVersions[slot]) return;
    setStatusReview(`作品JSONを読み込めませんでした。${error instanceof Error ? error.message : "形式を確認してください。"}`, "error");
  }
}

function createReviewInput() {
  if (!reviewArt) throw new TypeError("完成データJSONを選んでください。");
  const settings = collectSettings();
  if (settings.request.width !== reviewArt.width || settings.request.height !== reviewArt.height) {
    throw new TypeError("作品の寸法とキャンバス設定をそろえてください。");
  }
  const location = reviewLocation.value.trim();
  const problem = reviewProblem.value.trim();
  const hasObservation = Boolean(location || problem);
  if (hasObservation && (!location || !problem)) throw new TypeError("気になる点を記録する場合は場所と内容を入力してください。");
  const decision = reviewDecision.value;
  if ((hasObservation || decision !== "undecided") && !reviewObserved.checked) {
    throw new TypeError("観察内容や採否を記録する前に『原寸と使用背景で確認した』へチェックしてください。");
  }
  return {
    art: reviewArt,
    ...(reviewBeforeArt ? { before: reviewBeforeArt } : {}),
    request: settings.request,
    observationStatus: reviewObserved.checked ? "observed" : "not_observed",
    observations: hasObservation ? [{ category: reviewCategory.value, location, problem }] : [],
    decision,
  };
}

function appendReviewList(parent, title, values) {
  if (!values?.length) return;
  if (title) parent.append(textElement("h4", "", title));
  const list = document.createElement("ul");
  for (const value of values) list.append(textElement("li", "", value));
  parent.append(list);
}

const REVIEW_DECISIONS = Object.freeze({
  undecided: "まだ決めない",
  keep_current: "完成データを採用",
  keep_before: "修正前を採用",
  revise: "もう一度修正する",
});
const REVIEW_CATEGORIES = Object.freeze({ shape: "形・構造", palette: "色", light: "光・明暗", material: "素材", detail: "細部", context: "用途・背景" });

function renderReview(review) {
  const fragment = document.createDocumentFragment();
  const technical = document.createElement("section");
  technical.append(textElement("h3", "", "形式と画素の確認"));
  technical.append(textElement("p", "", `検査を通過 · ${review.technical.width} × ${review.technical.height}px · 使用色 ${review.technical.usedColors}色 · 不透明画素 ${review.technical.opaquePixels}個`));
  if (review.technical.comparison) {
    const comparison = review.technical.comparison;
    technical.append(textElement("p", "", comparison.sameDimensions
      ? `修正前との差: ${comparison.changedPixels}画素 (${comparison.changedPercent}%)`
      : "修正前後の寸法が異なるため、画素差分は計算していません。"));
  }
  fragment.append(technical);

  const visual = document.createElement("section");
  visual.append(textElement("h3", "", "見た目の確認"));
  visual.append(textElement("p", "", review.visual.status === "host_observed"
    ? `画像を確認した人やAIの記録 · 判断: ${REVIEW_DECISIONS[review.visual.decision]}`
    : `見た目の判断は未記録 · 判断: ${REVIEW_DECISIONS[review.visual.decision]}`));
  visual.append(textElement("p", "", "見た目の判断は、画像を確認した人やAIの記録です。この画面では画像内容を自動判定しません。"));
  if (review.visual.observations.length) {
    const observations = document.createElement("ul");
    for (const item of review.visual.observations) observations.append(textElement("li", "", `${REVIEW_CATEGORIES[item.category] ?? item.category} · ${item.location}: ${item.problem}`));
    visual.append(observations);
  }
  fragment.append(visual);

  if (review.correctionPlan.length) {
    const corrections = document.createElement("section");
    corrections.append(textElement("h3", "", "修正の考え方"));
    for (const item of review.correctionPlan) {
      const entry = document.createElement("div");
      entry.append(textElement("p", "", `${item.location} · ${item.returnTo}`));
      entry.append(textElement("p", "", item.action));
      entry.append(textElement("p", "", `再確認: ${item.check}`));
      corrections.append(entry);
    }
    fragment.append(corrections);
  }
  const nextActions = review.correctionPlan.length
    ? ["修正案を参考にAIまたはDrawで直し、修正版を表示して同じ条件で比べます。"]
    : review.visual.status === "not_assessed"
      ? ["完成画像を原寸と使用背景で確認し、気になる場所と内容を記録できます。"]
      : ["気になる点があれば修正を試し、修正版を同じ条件で確かめます。"];
  for (const [title, items] of [["次にできること", nextActions], ["この画面について", ["この画面では、作品の自動採点・Drawへの自動反映は行いません。"]]]) {
    const section = document.createElement("section");
    section.append(textElement("h3", "", title));
    appendReviewList(section, "", items);
    fragment.append(section);
  }
  reviewOutput.replaceChildren(fragment);
}

let lastReviewInput = null;

function invalidateReviewAssessment({ requireRecheck = false } = {}) {
  reviewOutput.replaceChildren();
  lastReviewInput = null;
  reviewCopyButton.disabled = true;
  if (requireRecheck) {
    reviewObserved.checked = false;
    reviewDecision.value = "undecided";
  }
  if (reviewArt || reviewBeforeArt) {
    setStatusReview("作品または制作条件が変わりました。原寸と使用背景をもう一度確認してください。");
  }
}

function clearReviewResultsForEdit() {
  reviewOutput.replaceChildren();
  lastReviewInput = null;
  reviewCopyButton.disabled = true;
  setStatusReview("見直し条件が更新されました。「見直し案を作る」を押してください。");
}

reviewArtFile.addEventListener("change", () => loadReviewArtFile(reviewArtFile.files?.[0], "art"));
reviewBeforeFile.addEventListener("change", () => loadReviewArtFile(reviewBeforeFile.files?.[0], "before"));
document.querySelector("#review-panel").addEventListener("toggle", drawReviewCanvases);
document.querySelector("#review-run").addEventListener("click", () => {
  try {
    const input = createReviewInput();
    const result = reviewPixelArt(input);
    lastReviewInput = input;
    renderReview(result);
    reviewCopyButton.disabled = false;
    setStatusReview("見直し案を表示しました。形式の検査結果は、作品の品質認定ではありません。修正はAIまたはDrawで行ってください。", "success");
  } catch (error) {
    reviewOutput.replaceChildren();
    lastReviewInput = null;
    reviewCopyButton.disabled = true;
    setStatusReview(error instanceof Error ? error.message : "入力内容を確認してください。", "error");
  }
});

reviewCopyButton.addEventListener("click", async () => {
  if (!lastReviewInput) return;
  const prompt = [
    "完成画像を原寸と使用背景で実際に確認し、必要な観察内容をreview_pixel_artに渡してください。MCP自身は画像を解析しません。",
    "以下の入力にある観察と採否は利用者の申告です。形式検査を作品の品質保証と呼ばず、修正案と再確認方法を示してください。",
    `review_pixel_artのJSON引数: ${JSON.stringify(lastReviewInput)}`,
  ].join("\n");
  try {
    await navigator.clipboard.writeText(prompt);
    setStatusReview("見直し用の指示をコピーしました。AIのチャットに貼り付け、完成画像も添付してください。", "success");
  } catch {
    setStatusReview("自動コピーできませんでした。完成データを選び直してから、見直し案を作り直してください。", "error");
  }
});

function renderCurrentSettings() {
  try {
    const settings = collectSettings();
    const guide = getPixelArtGuide(settings.request);
    const techniques = selectPixelArtTechniques(settings.request);
    promptOutput.value = buildAIProductionPrompt(settings);
    renderGuide(guide);
    renderTechniques(techniques);
    return settings;
  } catch (error) {
    promptOutput.value = "入力内容を確認すると、AIへの指示と制作ガイドを表示できます。";
    guideOutput.replaceChildren();
    return null;
  }
}

initializeExpressionFields();

for (const button of presetButtons) {
  button.addEventListener("click", () => {
    widthInput.value = button.dataset.size;
    heightInput.value = button.dataset.size;
    updatePresetState();
    renderCurrentSettings();
  });
}

for (const input of [widthInput, heightInput]) input.addEventListener("input", () => { updatePresetState(); renderCurrentSettings(); });
form.addEventListener("submit", (event) => event.preventDefault());
form.addEventListener("input", (event) => {
  invalidateReviewAssessment({ requireRecheck: true });
  renderCurrentSettings();
});
form.addEventListener("change", (event) => {
  invalidateReviewAssessment({ requireRecheck: true });
  if (event.target.matches('input[name="materials"]') && materialInputs.filter((input) => input.checked).length > 4) {
    event.target.checked = false;
    setStatus("素材は4種類まで選べます。", "error");
  }
  renderCurrentSettings();
});

for (const input of [reviewObserved, reviewCategory, reviewLocation, reviewProblem, reviewDecision]) {
  input.addEventListener("input", clearReviewResultsForEdit);
  input.addEventListener("change", clearReviewResultsForEdit);
}
window.addEventListener("resize", drawReviewCanvases, { passive: true });

document.querySelector("#settings-save").addEventListener("click", () => {
  try {
    const settings = collectSettings();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    setStatus("設定をこのブラウザーに保存しました。参考画像は保存していません。", "success");
  } catch (error) {
    setStatus(`設定を保存できませんでした。${error instanceof Error ? ` ${error.message}` : ""} ブラウザーの保存領域を確認してください。`, "error");
  }
});

document.querySelector("#settings-copy").addEventListener("click", async () => {
  const settings = renderCurrentSettings();
  if (!settings) {
    setStatus("入力を確認してから、AIへの指示をコピーしてください。", "error");
    return;
  }
  try {
    await navigator.clipboard.writeText(promptOutput.value);
    setStatus("指示をコピーしました。ChatGPTに貼り付けてください。参考画像があれば、ChatGPTへ直接添付できます。", "success");
  } catch {
    promptOutput.focus();
    promptOutput.select();
    setStatus("自動コピーできませんでした。選択した指示をコピーしてAIのチャットに貼り付けてください。", "error");
  }
});

document.querySelector("#settings-export").addEventListener("click", () => {
  try {
    const settings = collectSettings();
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: "application/json" });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = "pixieed-ai-settings.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    setStatus("設定JSONを書き出しました。参考画像は含まれません。", "success");
  } catch (error) {
    setStatus(`設定JSONを書き出せませんでした。${error instanceof Error ? ` ${error.message}` : ""}`, "error");
  }
});

document.querySelector("#settings-import").addEventListener("click", () => importFileInput.click());
importFileInput.addEventListener("change", async () => {
  const file = importFileInput.files?.[0];
  importFileInput.value = "";
  if (!file) return;
  if (file.size > MAX_JSON_BYTES) {
    setStatus("設定JSONは32KB以下のファイルを選んでください。", "error");
    return;
  }
  try {
    const parsed = JSON.parse(await file.text());
    const settings = normalizeAISettings(parsed);
    applySettings(settings);
    setStatus("設定JSONを読み込みました。端末への保存は「この端末に保存」を押してください。", "success");
  } catch (error) {
    setStatus(`設定JSONを読み込めませんでした。${error instanceof Error ? error.message : "形式を確認してください。"}`, "error");
  }
});

document.querySelector("#settings-reset").addEventListener("click", () => {
  try {
    applySettings(normalizeAISettings(DEFAULT_AI_SETTINGS));
    setStatus("フォームを初期設定に戻しました。保存済み設定は変更していません。", "success");
  } catch (error) {
    setStatus(`初期設定を表示できませんでした。${error instanceof Error ? error.message : ""}`, "error");
  }
});

try {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored !== null) {
    applySettings(normalizeAISettings(JSON.parse(stored)));
    setStatus("このブラウザーに保存した設定を読み込みました。", "success");
  } else {
    applySettings(normalizeAISettings(DEFAULT_AI_SETTINGS));
    setStatus("設定はこのページ内で編集できます。保存は「この端末に保存」を押したときに行います。");
  }
} catch (error) {
  applySettings(normalizeAISettings(DEFAULT_AI_SETTINGS));
  setStatus(`保存済み設定を読み込めませんでした。${error instanceof Error ? error.message : ""} 初期設定を表示しています。`, "error");
}
