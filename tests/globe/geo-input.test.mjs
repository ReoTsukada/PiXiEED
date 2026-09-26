import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCoordinates, googleMapsUrl, parseLocationInput } from '../../js/globe/geo-input.mjs';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-5, `${a} != ${b}`);

test('Google Maps place URL prefers the exact pin (!3d!4d) over the viewport centre', () => {
  const url = 'https://www.google.com/maps/place/Tokyo+Tower/@35.6595,139.7450,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x1!8m2!3d35.6585805!4d139.7454329';
  const result = parseLocationInput(url);
  assert.equal(result.ok, true);
  assert.equal(result.source, 'map-link');
  near(result.latitude, 35.658581); near(result.longitude, 139.745433);
});

test('viewport-only URL, q= URL and OSM URL are read', () => {
  const a = parseLocationInput('https://www.google.com/maps/@35.0116,135.7681,15z');
  near(a.latitude, 35.0116); near(a.longitude, 135.7681);
  const b = parseLocationInput('https://maps.google.com/?q=-33.8688,151.2093');
  near(b.latitude, -33.8688); near(b.longitude, 151.2093);
  const c = parseLocationInput('https://www.openstreetmap.org/#map=17/48.8566/2.3522');
  near(c.latitude, 48.8566); near(c.longitude, 2.3522);
});

test('plain, full-width, lettered and DMS coordinates', () => {
  for (const text of ['35.6895, 139.6917', '35.6895 139.6917', '（35.6895，139.6917）'.replace(/[（）]/g, ''), '３５.６８９５, １３９.６９１７', '35.6895N 139.6917E']) {
    const result = parseLocationInput(text);
    assert.equal(result.ok, true, text);
    near(result.latitude, 35.6895); near(result.longitude, 139.6917);
  }
  const dms = parseLocationInput('35°41′22.2″N 139°41′30.1″E');
  assert.equal(dms.ok, true); near(dms.latitude, 35.6895); near(dms.longitude, 139.691694);
  const south = parseLocationInput('33°52′08″S 151°12′34″E');
  assert.ok(south.latitude < 0 && south.longitude > 0);
});

test('short links, name-only links, bad ranges and junk explain themselves', () => {
  assert.equal(parseLocationInput('https://maps.app.goo.gl/abc123').reason, 'short-link');
  assert.equal(parseLocationInput('https://www.google.com/maps/place/Tokyo/').reason, 'no-coords');
  assert.equal(parseLocationInput('139.69, 35.68').reason, 'range');
  assert.equal(parseLocationInput('こんにちは').reason, 'unrecognized');
  assert.equal(parseLocationInput('   ').reason, 'empty');
  for (const text of ['https://maps.app.goo.gl/abc123', '139.69, 35.68', 'x']) assert.ok(parseLocationInput(text).message.length > 0 || text === '');
});

test('formatting helpers', () => {
  assert.equal(formatCoordinates(35.6895, 139.6917), '35.6895°N 139.6917°E');
  assert.equal(formatCoordinates(-33.8688, -70.5), '33.8688°S 70.5000°W');
  assert.match(googleMapsUrl(35.1, 139.2), /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=35\.1,139\.2$/);
});
