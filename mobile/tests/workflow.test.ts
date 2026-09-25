import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createCanvas, Image } from '@napi-rs/canvas';
import 'fake-indexeddb/auto';
import * as tf from '@tensorflow/tfjs';
import {
  newProject,
  parseProject,
  trainingIssue,
  readLocal,
  writeLocal,
} from '../lib/project';
import { squareCanvas } from '../lib/images';
import {
  trainProject,
  modelArchive,
  importModelArchive,
  restore,
} from '../lib/ml';

// Actual image pixels and actual TensorFlow execution; only browser IO is
// adapted to Node so training can be verified without a connected camera.
Object.defineProperty(globalThis, 'Image', {
  value: Image,
  configurable: true,
});
Object.defineProperty(globalThis, 'document', {
  value: {
    createElement: (name: string) => {
      assert.equal(name, 'canvas');
      return createCanvas(224, 224);
    },
  },
  configurable: true,
});
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  if (url.startsWith('/models/'))
    return new Response(await readFile(resolve('public', url.slice(1))));
  return originalFetch(input, init);
};
function sample(label: number, variation: number) {
  const canvas = createCanvas(224, 224);
  const context = canvas.getContext('2d');
  context.fillStyle = label === 0 ? '#d6422a' : '#244eb2';
  context.fillRect(0, 0, 224, 224);
  context.fillStyle = label === 0 ? '#ffeec6' : '#b4e1ff';
  for (let i = 0; i < 4; i++) {
    if (label === 0) context.fillRect(15, 18 + i * 46 + variation, 190, 16);
    else context.fillRect(18 + i * 46 + variation, 15, 16, 190);
  }
  return canvas;
}

test('samples and labels survive saving and backup/restore; invalid projects are rejected', async () => {
  const project = newProject();
  assert.match(trainingIssue(project)!, /5 samples/);
  project.classes.forEach((c, label) => {
    c.name = label === 0 ? 'Horizontal' : 'Vertical';
    c.samples = Array.from({ length: 6 }, (_, index) => ({
      id: crypto.randomUUID(),
      dataUrl: sample(label, index).toDataURL('image/jpeg'),
    }));
  });
  assert.equal(trainingIssue(project), null);
  await writeLocal('project', project);
  assert.deepEqual(await readLocal('project'), project);
  const backup = parseProject(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(
    backup.classes.map((c) => c.samples.map((s) => s.dataUrl)),
    project.classes.map((c) => c.samples.map((s) => s.dataUrl)),
  );
  assert.notEqual(backup.id, project.id);
  assert.throws(
    () =>
      parseProject({
        ...project,
        classes: [
          { name: 'bad', samples: [{ dataUrl: 'javascript:alert(1)' }] },
          project.classes[1],
        ],
      }),
    /unsupported image/,
  );
  assert.throws(() => parseProject({ version: 17 }), /supported mobile/);
  backup.classes[1].name = backup.classes[0].name;
  assert.match(trainingIssue(backup)!, /different name/);
});

test('crop uses the center square and produces 224px samples', () => {
  const wide = createCanvas(448, 224);
  const c = wide.getContext('2d');
  c.fillStyle = 'red';
  c.fillRect(0, 0, 448, 224);
  c.fillStyle = 'blue';
  c.fillRect(112, 0, 224, 224);
  const result = squareCanvas(wide as unknown as HTMLCanvasElement);
  assert.equal(result.width, 224);
  assert.deepEqual(
    Array.from(result.getContext('2d')!.getImageData(0, 0, 1, 1).data),
    [0, 0, 255, 255],
  );
});

test(
  'real training → prediction → export/import → persisted model, with tensor cleanup',
  { timeout: 180000 },
  async () => {
    await tf.setBackend('cpu');
    await tf.ready();
    const before = tf.memory().numTensors;
    const project = newProject();
    project.epochs = 30;
    project.batchSize = 8;
    project.classes.forEach((c, label) => {
      c.name = label === 0 ? 'Horizontal' : 'Vertical';
      c.samples = Array.from({ length: 8 }, (_, index) => ({
        id: crypto.randomUUID(),
        dataUrl: sample(label, index).toDataURL('image/jpeg'),
      }));
    });
    let lastProgress = 0;
    const model = await trainProject(
      project,
      (progress) => {
        lastProgress = progress.percent;
      },
      new AbortController().signal,
    );
    assert.equal(lastProgress, 100);
    for (const label of [0, 1]) {
      const prediction = await model.predict(
        sample(label, 10) as unknown as HTMLCanvasElement,
      );
      assert.equal(prediction.length, 2);
      assert.ok(prediction.every(Number.isFinite));
      assert.ok(
        prediction[label] > 0.65,
        `Expected class ${label} to win: ${prediction}`,
      );
    }
    const snapshot = await model.snapshot(project.id, project.revision);
    await writeLocal('model', snapshot);
    const reloaded = await restore(
      (await readLocal<typeof snapshot>('model'))!,
    );
    const zip = modelArchive(snapshot);
    const imported = await importModelArchive(
      new File([new Uint8Array(zip)], 'model.zip', { type: 'application/zip' }),
    );
    const input = sample(1, 12) as unknown as HTMLCanvasElement;
    const expected = await model.predict(input);
    for (const candidate of [reloaded, imported]) {
      assert.deepEqual(candidate.metadata.labels, ['Horizontal', 'Vertical']);
      const result = await candidate.predict(input);
      result.forEach((p, i) => assert.ok(Math.abs(p - expected[i]) < 0.00001));
    }
    model.dispose();
    reloaded.dispose();
    imported.dispose();
    assert.equal(
      tf.memory().numTensors,
      before,
      'Training and export must release all model and optimizer tensors',
    );
  },
);

test(
  'cancelling during feature extraction frees temporary tensors and keeps samples',
  { timeout: 120000 },
  async () => {
    const before = tf.memory().numTensors;
    const project = newProject();
    const abort = new AbortController();
    project.classes.forEach((c, label) => {
      c.samples = Array.from({ length: 5 }, (_, i) => ({
        id: crypto.randomUUID(),
        dataUrl: sample(label, i).toDataURL('image/jpeg'),
      }));
    });
    await assert.rejects(
      () =>
        trainProject(
          project,
          (p) => {
            if (p.percent > 5) abort.abort();
          },
          abort.signal,
        ),
      { name: 'AbortError' },
    );
    assert.equal(project.classes[0].samples.length, 5);
    assert.equal(tf.memory().numTensors, before);
  },
);
