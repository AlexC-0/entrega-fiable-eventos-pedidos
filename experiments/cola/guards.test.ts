import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requiredUrl } from './support.js';

test('seguridad: rechaza variable ausente, URL inválida y base diferente', () => {
  assert.throws(() => requiredUrl(''), /obligatoria/);
  assert.throws(() => requiredUrl('no-es-url'), /válida/);
  assert.throws(() => requiredUrl('postgresql://127.0.0.1/produccion'), /Base rechazada/);
});
