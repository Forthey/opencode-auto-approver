import { test } from 'node:test'
import assert from 'node:assert/strict'
import { describeError } from '../src/errors.ts'

test('shows the message and type of an RPC error object', () => {
  assert.match(describeError({ type: 'rpc.invalid_input', message: 'Expected object' }), /rpc.invalid_input.*Expected object/)
})

test('shows regular error messages', () => {
  assert.equal(describeError(new Error('offline')), 'offline')
})
