// Rebuild the bundled frozen feature extractor from the TensorFlow checkpoint.
import * as tf from '@tensorflow/tfjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
await tf.setBackend('cpu');
const source =
  'https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_0.25_224/model.json';
const full = await tf.loadLayersModel(source);
const pooled = tf.layers
  .globalAveragePooling2d({ dataFormat: 'channelsLast' })
  .apply(full.getLayer('conv_pw_13_relu').output);
const base = tf.model({ inputs: full.inputs, outputs: pooled });
const dir = resolve('public/models/mobilenet');
await mkdir(dir, { recursive: true });
await base.save(
  tf.io.withSaveHandler(async (artifacts) => {
    await writeFile(
      resolve(dir, 'model.json'),
      JSON.stringify({
        modelTopology: artifacts.modelTopology,
        format: 'layers-model',
        generatedBy: `TensorFlow.js ${tf.version.tfjs}`,
        weightsManifest: [
          { paths: ['weights.bin'], weights: artifacts.weightSpecs },
        ],
      }),
    );
    await writeFile(
      resolve(dir, 'weights.bin'),
      new Uint8Array(artifacts.weightData),
    );
    return {
      modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: 'JSON' },
    };
  }),
);
console.log('Saved pooled MobileNet feature extractor.');
