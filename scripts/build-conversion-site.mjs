#!/usr/bin/env node
/** Extend the existing publisher without changing source files during a build. */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildPagesSite } from './build-pages-site.mjs';
import { generateConversionGuides } from './generate-conversion-guides.mjs';
export async function buildConversionSite(options) {
  const built = await buildPagesSite(options);
  const guides = await generateConversionGuides({ root: resolve(options.output), write: true });
  return { ...built, conversionGuides: guides.pages, conversionExamples: guides.routes };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 4 || process.argv[2] !== '--output') throw new Error('Usage: node scripts/build-conversion-site.mjs --output <new directory>');
  console.log(JSON.stringify(await buildConversionSite({ output: process.argv[3] })));
}
