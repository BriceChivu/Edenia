import assert from 'node:assert/strict'
import test from 'node:test'
import { isLocalTestOrigin } from '../support/local-test-origin.mjs'

test('generated local game workers remain inside the browser network boundary', () => {
  for (const url of [
    'http://localhost:8000/game.wasm', 'https://localhost./game.wasm',
    'http://127.0.0.1:8000/game.wasm', 'http://[::1]:8000/game.wasm',
    'blob:http://localhost:8000/local-worker',
    'blob:https://127.0.0.1:8000/local-worker'
  ]) assert.equal(isLocalTestOrigin(new URL(url)), true, url)
})

test('generated workers do not exempt remote, opaque or non-HTTP origins', () => {
  for (const url of [
    'https://supabase.example.invalid/profile',
    'blob:https://supabase.example.invalid/remote-worker',
    'blob:https://localhost.example.invalid/remote-worker',
    'blob:https://localhost@remote.example.invalid/remote-worker',
    'blob:null/opaque-worker', 'blob:file:///opaque-worker',
    'file://localhost/local-worker', 'data:text/javascript,postMessage(1)'
  ]) assert.equal(isLocalTestOrigin(new URL(url)), false, url)
})
