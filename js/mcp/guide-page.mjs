import { GUIDE_VERSION, getPixelArtGuide } from "./pixel-art-guide.mjs";

const form = document.querySelector("#guide-form");
const result = document.querySelector("#guide-result");
const status = document.querySelector("#guide-status");
const version = document.querySelector("#guide-version");
const widthInput = document.querySelector("#guide-width");
const heightInput = document.querySelector("#guide-height");
const presets = [...document.querySelectorAll("[data-size]")];
const materialInputs = [...form.querySelectorAll('input[name="materials"]')];
const DEFAULT_REQUEST = Object.freeze({ subject: "character", width: 16, height: 16, materials: [], animated: false, normalMap: false, style: "neutral" });

function parseQueryRequest() {
  const params = new URLSearchParams(window.location.search);
  const values = (key) => params.getAll(key);
  const one = (key) => {
    const found = values(key);
    if (found.length > 1) throw new TypeError(`${key}は1つだけ指定してください。`);
    return found[0];
  };
  const booleanValue = (key) => {
    const value = one(key);
    if (value === undefined) return false;
    if (value === "true") return true;
    if (value === "false") return false;
    throw new TypeError(`${key}はtrueまたはfalseで指定してください。`);
  };
  const width = one("width");
  const height = one("height");
  const materialValue = one("materials");
  const request = {
    subject: one("subject") ?? DEFAULT_REQUEST.subject,
    style: one("style") ?? DEFAULT_REQUEST.style,
    width: width === undefined ? DEFAULT_REQUEST.width : Number(width),
    height: height === undefined ? DEFAULT_REQUEST.height : Number(height),
    materials: materialValue === undefined || materialValue === "" ? [] : materialValue.split(","),
    animated: booleanValue("animated"),
    normalMap: booleanValue("normalMap"),
  };
  const expression = one("expression");
  if (expression !== undefined) request.expression = JSON.parse(expression);
  return getPixelArtGuide(request).request;
}

let initialRequest = DEFAULT_REQUEST;
let initialWarning = "";
if (window.location.search) {
  try {
    initialRequest = parseQueryRequest();
  } catch (error) {
    initialWarning = `URLの条件を確認できないため、16 × 16pxのキャラクター向けガイドを表示しています。${error instanceof Error ? ` ${error.message}` : ""}`;
  }
}

function applyRequest(request) {
  form.elements.subject.value = request.subject;
  form.elements.style.value = request.style;
  widthInput.value = String(request.width);
  heightInput.value = String(request.height);
  for (const input of materialInputs) input.checked = request.materials.includes(input.value);
  form.elements.animated.checked = request.animated;
  form.elements.normalMap.checked = request.normalMap;
  for (const preset of presets) {
    const selected = request.width === Number(preset.dataset.size) && request.height === Number(preset.dataset.size);
    preset.setAttribute("aria-pressed", String(selected));
  }
}

version.textContent = String(GUIDE_VERSION);

function createText(tagName, className, value) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = String(value ?? "");
  return element;
}

function addListPanel(title, values) {
  const section = document.createElement("section");
  section.className = "ai-guide__panel";
  section.append(createText("h2", "", title));
  const list = document.createElement("ul");
  list.className = "ai-guide__list";
  for (const value of values) list.append(createText("li", "", value));
  section.append(list);
  return section;
}

function currentRequest() {
  return {
    subject: form.elements.subject.value,
    style: form.elements.style.value,
    width: Number(widthInput.value),
    height: Number(heightInput.value),
    materials: materialInputs.filter((input) => input.checked).map((input) => input.value),
    animated: form.elements.animated.checked,
    normalMap: form.elements.normalMap.checked,
    ...(initialRequest.expression ? { expression: initialRequest.expression } : {}),
  };
}

function renderGuide(request = currentRequest(), warning = "") {
  const guide = getPixelArtGuide(request);
  const fragment = document.createDocumentFragment();

  const stepsPanel = document.createElement("section");
  stepsPanel.className = "ai-guide__panel";
  stepsPanel.append(createText("h2", "", "制作の手順"));
  const steps = document.createElement("ol");
  steps.className = "ai-guide__steps";
  for (const step of guide.steps) {
    const item = document.createElement("li");
    item.className = "ai-guide__step";
    const content = document.createElement("div");
    content.append(createText("h3", "", step.title));
    content.append(createText("p", "", step.body));
    item.append(content);
    steps.append(item);
  }
  stepsPanel.append(steps);
  fragment.append(stepsPanel);
  fragment.append(addListPanel("仕上がりの見直し", guide.reviewChecklist));
  fragment.append(addListPanel("知っておきたいこと", guide.limitations));

  if (guide.sources.length) {
    const sourcesPanel = document.createElement("section");
    sourcesPanel.className = "ai-guide__panel";
    sourcesPanel.append(createText("h2", "", "参考リンク"));
    const sources = document.createElement("ul");
    sources.className = "ai-guide__sources";
    for (const source of guide.sources) {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = source.url;
      link.rel = "noopener";
      link.append(createText("span", "", source.title));
      link.append(createText("span", "ai-guide__source-url", source.url));
      item.append(link);
      sources.append(item);
    }
    sourcesPanel.append(sources);
    fragment.append(sourcesPanel);
  }

  result.replaceChildren(fragment);
  status.dataset.state = warning ? "warning" : "ready";
  status.textContent = warning || `${guide.request.width} × ${guide.request.height}pxのガイドを表示しています。`;
}

for (const preset of presets) {
  preset.addEventListener("click", () => {
    widthInput.value = preset.dataset.size;
    heightInput.value = preset.dataset.size;
    for (const item of presets) item.setAttribute("aria-pressed", String(item === preset));
  });
}

for (const input of [widthInput, heightInput]) {
  input.addEventListener("input", () => {
    for (const preset of presets) {
      const selected = widthInput.value === preset.dataset.size && heightInput.value === preset.dataset.size;
      preset.setAttribute("aria-pressed", String(selected));
    }
  });
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  try {
    const request = getPixelArtGuide(currentRequest()).request;
    const params = new URLSearchParams({
      subject: request.subject,
      style: request.style,
      width: String(request.width),
      height: String(request.height),
      materials: request.materials.join(","),
      animated: String(request.animated),
      normalMap: String(request.normalMap),
    });
    if (request.expression) params.set("expression", JSON.stringify(request.expression));
    window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
    renderGuide(request);
  } catch (error) {
    result.replaceChildren();
    status.dataset.state = "error";
    status.textContent = error instanceof Error ? error.message : "ガイドを表示できませんでした。入力内容を確認してください。";
  }
});

applyRequest(initialRequest);
if (materialInputs.length) {
  for (const input of materialInputs) {
    input.addEventListener("change", () => {
      const selected = materialInputs.filter((item) => item.checked);
      if (selected.length > 4) {
        input.checked = false;
        status.dataset.state = "error";
        status.textContent = "素材は4種類まで選べます。";
      }
    });
  }
}
renderGuide(initialRequest, initialWarning);
