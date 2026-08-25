import fs from "node:fs";
import path from "node:path";

const sourcePath = new URL("./draw2-icons.svg", import.meta.url);
const source = fs.readFileSync(sourcePath, "utf8");
const outputDirectory = new URL("./export-v040/", import.meta.url);
fs.mkdirSync(outputDirectory, { recursive: true });

const symbols = source.split("<symbol").slice(1).map((part) => {
  const end = part.indexOf(">");
  const attrs = part.slice(0, end);
  const body = part.slice(end + 1, part.indexOf("</symbol>"));
  const id = attrs.split(`id="`)[1].split(`"`)[0];
  return { id, body };
});

for (const { id, body } of symbols) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" shape-rendering="geometricPrecision">${body}</svg>\n`;
  fs.writeFileSync(path.join(outputDirectory.pathname, `${id}.svg`), svg);
}

console.log(JSON.stringify({ outputDirectory: outputDirectory.pathname, files: symbols.length }));
