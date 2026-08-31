/**
 * Conservative build-time CSS minifier for the Draw2 shell.
 *
 * It only removes ordinary comments and collapses whitespace outside quoted
 * strings. It intentionally does not rewrite selectors, values, custom
 * properties, calc() expressions, or declaration order because draw2-shell.css
 * contains deliberate late-cascade contracts.
 */
export function minifyCss(source: string): string {
  let output = "";
  let quote: '"' | "'" | null = null;
  let escaped = false;
  let inComment = false;
  let pendingWhitespace = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] ?? "";
    const nextCharacter = source[index + 1] ?? "";

    if (inComment) {
      if (character === "*" && nextCharacter === "/") {
        inComment = false;
        pendingWhitespace = true;
        index += 1;
      }
      continue;
    }

    if (quote !== null) {
      output += character;
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === "/" && nextCharacter === "*") {
      // Preserve /*! ... */ license comments while removing documentation
      // comments that have no effect on CSS parsing or rendering.
      if (source[index + 2] === "!") {
        const end = source.indexOf("*/", index + 2);
        if (end === -1) {
          throw new Error("Unterminated preserved CSS comment");
        }
        if (pendingWhitespace && output.length > 0 && !output.endsWith(" ")) {
          output += " ";
        }
        output += source.slice(index, end + 2);
        pendingWhitespace = true;
        index = end + 1;
      } else {
        inComment = true;
        pendingWhitespace = true;
        index += 1;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      if (pendingWhitespace && output.length > 0 && !output.endsWith(" ")) {
        output += " ";
      }
      pendingWhitespace = false;
      quote = character;
      output += character;
      continue;
    }

    if (/\s/.test(character)) {
      pendingWhitespace = true;
      continue;
    }

    if (pendingWhitespace && output.length > 0 && !output.endsWith(" ")) {
      output += " ";
    }
    pendingWhitespace = false;
    output += character;
  }

  return `${output.trim()}\n`;
}

async function main(): Promise<void> {
  const sourceUrl = new URL("../assets/draw2-shell.css", import.meta.url);
  const outputUrl = new URL("../assets/draw2-shell.min.css", import.meta.url);
  const source = await Deno.readTextFile(sourceUrl);
  const minified = minifyCss(source);

  if (
    !minified.includes(".draw2-canvas-stack") ||
    !minified.includes("--draw2-color-map-size")
  ) {
    throw new Error(
      "CSS contract markers are missing from the minified output",
    );
  }

  await Deno.writeTextFile(outputUrl, minified);
  const encoder = new TextEncoder();
  const sourceBytes = encoder.encode(source).byteLength;
  const minifiedBytes = encoder.encode(minified).byteLength;
  const reduction = ((1 - minifiedBytes / sourceBytes) * 100).toFixed(1);
  console.log(
    `draw2-shell.css: ${sourceBytes} -> ${minifiedBytes} bytes (${reduction}% smaller)`,
  );
}

if (import.meta.main) {
  await main();
}
