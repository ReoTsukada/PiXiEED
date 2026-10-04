import assert from 'node:assert/strict';
import { ChromeCdp } from './lib/puzzle-ogp-browser.mjs';

class FakeWebSocket {
  static CLOSED = 3;
  static OPEN = 1;
  readyState = FakeWebSocket.OPEN;
  listeners = new Map();
  addEventListener(type, listener) {
    const callbacks = this.listeners.get(type) || new Set();
    callbacks.add(listener); this.listeners.set(type, callbacks);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  send() {}
  close() { /* Simulate a socket that never delivers its close event. */ }
}

async function bounded(promise, message) {
  const started = Date.now();
  await promise;
  assert.ok(Date.now() - started < 500, message);
}

const connect = new ChromeCdp('ws://fake', { WebSocketImpl: FakeWebSocket, connectTimeoutMs: 20, commandTimeoutMs: 20, closeTimeoutMs: 20 });
await assert.rejects(connect.connect(), /Timed out connecting/);
assert.equal(connect.pending.size, 0);
await bounded(connect.close(), 'close after failed connect must be bounded');

const command = new ChromeCdp('ws://fake', { WebSocketImpl: FakeWebSocket, connectTimeoutMs: 20, commandTimeoutMs: 20, closeTimeoutMs: 20 });
command.socket = new FakeWebSocket();
await assert.rejects(command.send('Runtime.evaluate'), /Timed out waiting/);
assert.equal(command.pending.size, 0, 'timed-out CDP commands must be removed');
await bounded(command.close(), 'a hung socket close must be bounded');
assert.equal(command.pending.size, 0, 'close must clear all pending CDP commands');

console.log('CDP connection, command, and close timeouts PASS');
