import test from 'node:test';
import assert from 'node:assert/strict';
import { createContext, runInContext } from 'node:vm';
import { setImmediate } from 'node:timers/promises';
import { modelExample, type SnippetLanguage } from '../lib/export-snippets';

class Element {
  disabled = false;
  textContent = '';
  children: Element[] = [];
  handlers: Record<string, () => unknown> = {};
  appendChild(child: Element) {
    this.children.push(child);
  }
  replaceChildren(...children: Element[]) {
    this.children = children;
  }
  addEventListener(event: string, callback: () => unknown) {
    this.handlers[event] = callback;
  }
}

// Execute the actual copy/paste examples. The model and camera stand in for
// hardware; path resolution, prediction rendering, and lifecycle code are real.
function harness(language: SnippetLanguage, delayedLoad?: Promise<void>) {
  const html = modelExample(language);
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)![1];
  const elements = Object.fromEntries(
    ['start', 'stop', 'status', 'label-container', 'webcam-container'].map(
      (id) => [id, new Element()],
    ),
  );
  const frames: (() => void)[] = [];
  const calls = {
    cameraStarts: 0,
    cameraStops: 0,
    predictions: 0,
    draws: 0,
    denyCamera: false,
  };
  const labels = ['<img src=x onerror=alert(1)>', 'Background'];
  const model = {
    getClassLabels: () => labels,
    predict: async () => {
      calls.predictions++;
      return labels.map((className, i) => ({
        className,
        probability: i === 0 ? 0.75 : 0.25,
      }));
    },
  };
  class Webcam {
    canvas = new Element();
    webcam = { srcObject: null as object | null, setAttribute: () => {} };
    async setup(options: { facingMode: string }) {
      assert.equal(options.facingMode, 'environment');
      if (calls.denyCamera) throw new Error('Permission denied');
      this.webcam.srcObject = {};
      calls.cameraStarts++;
    }
    async play() {}
    update() {}
    stop() {
      calls.cameraStops++;
      this.webcam.srcObject = null;
    }
  }
  const window = new Element();
  const document = {
    hidden: false,
    getElementById: (id: string) => elements[id],
    createElement: () => new Element(),
    addEventListener: (_event: string, _callback: () => unknown) => {},
  };
  const context = createContext({
    document,
    window,
    requestAnimationFrame: (callback: () => void) => frames.push(callback),
    tmImage: {
      Webcam,
      load: async (modelUrl: string, metadataUrl: string) => {
        assert.equal(modelUrl, './my_model/model.json');
        assert.equal(metadataUrl, './my_model/metadata.json');
        await delayedLoad;
        return model;
      },
    },
    createCanvas: () => ({
      parent: (id: string) => assert.equal(id, 'webcam-container'),
    }),
    frameRate: () => {},
    background: () => {},
    noLoop: () => {},
    loop: () => {},
    drawingContext: {
      drawImage: () => {
        calls.draws++;
      },
    },
    width: 224,
    height: 224,
  });
  runInContext(script, context);
  if (language === 'p5') runInContext('setup()', context);
  return { context, elements, frames, calls, window };
}

for (const language of ['javascript', 'p5'] as const) {
  test(`${language} example loads downloaded files, predicts, and stops its camera`, async () => {
    const h = harness(language);
    await runInContext('start()', h.context);
    await setImmediate();
    assert.equal(h.calls.cameraStarts, 1);
    assert.equal(h.elements.start.disabled, true);
    assert.equal(
      h.elements['label-container'].children[0].textContent,
      '<img src=x onerror=alert(1)>: 75.0%',
    );
    assert.equal(
      h.elements['label-container'].children[1].textContent,
      'Background: 25.0%',
    );
    assert.equal(h.frames.length, 1);
    if (language === 'p5') {
      runInContext('draw()', h.context);
      assert.equal(h.calls.draws, 1);
    }
    h.window.handlers.pagehide();
    assert.equal(h.calls.cameraStops, 1);
    assert.equal(h.elements.start.disabled, false);
    h.frames[0]();
    assert.equal(
      h.calls.predictions,
      1,
      'A queued frame must not predict after stopping',
    );
  });

  test(`${language} example can retry camera permission errors`, async () => {
    const h = harness(language);
    h.calls.denyCamera = true;
    await runInContext('start()', h.context);
    assert.match(h.elements.status.textContent, /Permission denied/);
    assert.equal(h.elements.start.disabled, false);
    h.calls.denyCamera = false;
    await runInContext('start()', h.context);
    assert.equal(h.calls.cameraStarts, 1);
    assert.match(h.elements.status.textContent, /Camera running/);
    runInContext('stop()', h.context);
  });

  test(`${language} example does not open the camera after stopping a pending start`, async () => {
    let resolveLoad!: () => void;
    const h = harness(
      language,
      new Promise<void>((resolve) => {
        resolveLoad = resolve;
      }),
    );
    const pendingStart = runInContext('start()', h.context);
    runInContext('stop()', h.context);
    resolveLoad();
    await pendingStart;
    assert.equal(h.calls.cameraStarts, 0);
    assert.equal(h.elements.start.disabled, false);
    assert.match(h.elements.status.textContent, /Camera stopped/);
  });
}
