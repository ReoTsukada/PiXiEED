import {
  draw2LocaleLabel,
  normalizeDraw2Locale,
  translateDraw2Text,
} from "../src/draw2-i18n.ts";

Deno.test("Draw2 locale normalization defaults safely to English", () => {
  if (normalizeDraw2Locale("ja") !== "ja") {
    throw new Error("Japanese locale was not accepted.");
  }
  if (
    normalizeDraw2Locale("fr") !== "en" ||
    normalizeDraw2Locale(undefined) !== "en"
  ) throw new Error("Unknown locale did not fail closed to English.");
  if (
    draw2LocaleLabel("ja") !== "日本語" || draw2LocaleLabel("en") !== "English"
  ) throw new Error("Locale label is inconsistent.");
});

Deno.test("Draw2 translations preserve whitespace and round-trip", () => {
  const japanese = translateDraw2Text(
    "  Selection cleared by clicking outside.  ",
    "ja",
  );
  if (japanese !== "  選択範囲外をクリックしたため選択を解除しました。  ") {
    throw new Error("Japanese translation did not preserve whitespace.");
  }
  if (
    translateDraw2Text(japanese, "en") !==
      "  Selection cleared by clicking outside.  "
  ) throw new Error("Translation did not round-trip to English.");
  if (
    translateDraw2Text("Pixel drawing tools", "ja") !== "ピクセル描画ツール"
  ) {
    throw new Error("Accessibility label was not translated.");
  }
  if (
    translateDraw2Text("Filled rectangle", "ja") !== "塗りつぶし四角形" ||
    translateDraw2Text("Play timeline", "ja") !== "タイムラインを再生"
  ) {
    throw new Error("Tool labels must not contain partial translations.");
  }
});
