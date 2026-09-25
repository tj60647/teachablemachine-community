import * as tf from '@tensorflow/tfjs';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { decodeImage, squareCanvas, type CameraSource } from './images';
import { trainingIssue, type Project } from './project';

export const BASE_URL = '/models/mobilenet/model.json';
export type ModelMetadata = {
  labels: string[];
  imageSize: number;
  grayscale?: boolean;
  tfjsVersion: string;
  packageName: string;
  modelName?: string;
  timeStamp?: string;
};
export type SavedModel = {
  projectId: string;
  revision: number;
  metadata: ModelMetadata;
  artifacts: tf.io.ModelArtifacts;
};
export type ProgressUpdate = {
  percent: number;
  message: string;
  accuracy?: number;
};
let initialized: Promise<void> | undefined;
export function initialize() {
  initialized ??= (async () => {
    try {
      await tf.setBackend('webgl');
    } catch {
      await tf.setBackend('cpu');
    }
    await tf.ready();
  })();
  return initialized;
}
export class ImageModel {
  constructor(
    public model: tf.LayersModel,
    public metadata: ModelMetadata,
  ) {}
  dispose() {
    this.model.dispose();
  }
  async predict(source: CameraSource, flip = false): Promise<number[]> {
    const canvas = squareCanvas(source, this.metadata.imageSize, flip);
    const logits = tf.tidy(() => {
      let pixels: tf.Tensor = tf.browser.fromPixels(canvas).toFloat();
      if (this.metadata.grayscale)
        pixels = pixels
          .mul(tf.tensor1d([0.2989, 0.587, 0.114]))
          .sum(-1)
          .expandDims(-1);
      return this.model.predict(
        pixels.div(127).sub(1).expandDims(0),
      ) as tf.Tensor;
    });
    try {
      return Array.from(await logits.data());
    } finally {
      logits.dispose();
    }
  }
  async snapshot(projectId: string, revision: number): Promise<SavedModel> {
    let artifacts!: tf.io.ModelArtifacts;
    await this.model.save(
      tf.io.withSaveHandler(async (saved) => {
        artifacts = saved;
        return {
          modelArtifactsInfo: {
            dateSaved: new Date(),
            modelTopologyType: 'JSON',
          },
        };
      }),
    );
    return { artifacts, metadata: this.metadata, projectId, revision };
  }
}
export async function restore(saved: SavedModel): Promise<ImageModel> {
  await initialize();
  const model = await tf.loadLayersModel(tf.io.fromMemory(saved.artifacts));
  try {
    validateModel(model, saved.metadata);
  } catch (e) {
    model.dispose();
    throw e;
  }
  return new ImageModel(model, saved.metadata);
}
function validateModel(model: tf.LayersModel, metadata: ModelMetadata) {
  const shape = model.inputs[0]?.shape;
  const labels = metadata?.labels;
  if (
    model.inputs.length !== 1 ||
    model.outputs.length !== 1 ||
    !shape ||
    shape.length !== 4 ||
    shape[1] !== shape[2] ||
    !shape[1] ||
    shape[1] > 512 ||
    ![1, 3].includes(shape[3] ?? 0) ||
    !Array.isArray(labels) ||
    labels.length < 2 ||
    labels.length > 100 ||
    labels.some((l) => typeof l !== 'string' || l.length > 200) ||
    model.outputs[0].shape.at(-1) !== labels.length
  )
    throw new Error(
      'Use a Teachable Machine image model with matching labels. Audio and pose models are not supported here.',
    );
  metadata.imageSize = shape[1];
  metadata.grayscale = shape[3] === 1;
}

// Freeze MobileNet and train only a small head on cached image features. Pooling
// keeps each saved feature vector small enough for a phone, even with many images.
export async function trainProject(
  project: Project,
  onProgress: (update: ProgressUpdate) => void,
  signal: AbortSignal,
): Promise<ImageModel> {
  const issue = trainingIssue(project);
  if (issue) throw new Error(issue);
  const check = () => {
    if (signal.aborted)
      throw new DOMException(
        'Training stopped. Your samples are saved.',
        'AbortError',
      );
  };
  await initialize();
  check();
  onProgress({ percent: 1, message: 'Loading the image model…' });
  let base: tf.LayersModel | undefined,
    head: tf.Sequential | undefined,
    joined: tf.LayersModel | undefined;
  let optimizer: tf.Optimizer | undefined;
  let xs: tf.Tensor2D | undefined, ys: tf.Tensor2D | undefined;
  const features: tf.Tensor[] = [];
  try {
    base = await tf.loadLayersModel(BASE_URL);
    check();
    for (const layer of base.layers) layer.trainable = false;
    const labels: number[] = [];
    const total = project.classes.reduce((sum, c) => sum + c.samples.length, 0);
    for (let index = 0; index < project.classes.length; index++) {
      for (const sample of project.classes[index].samples) {
        check();
        const image = await decodeImage(sample.dataUrl);
        check();
        const feature = tf.tidy(
          () =>
            base!.predict(
              tf.browser
                .fromPixels(squareCanvas(image))
                .toFloat()
                .div(127)
                .sub(1)
                .expandDims(0),
            ) as tf.Tensor,
        );
        features.push(feature);
        labels.push(index);
        onProgress({
          percent: 5 + Math.round((features.length / total) * 45),
          message: `Preparing samples · ${features.length} / ${total}`,
        });
        await tf.nextFrame();
      }
    }
    const order = Array.from({ length: total }, (_, i) => i);
    tf.util.shuffle(order);
    xs = tf.concat(order.map((i) => features[i])) as tf.Tensor2D;
    ys = tf.tidy(() =>
      tf.oneHot(
        tf.tensor1d(
          order.map((i) => labels[i]),
          'int32',
        ),
        project.classes.length,
      ),
    ) as tf.Tensor2D;
    features.forEach((feature) => feature.dispose());
    features.length = 0;
    head = tf.sequential({
      layers: [
        tf.layers.dense({
          inputShape: [xs.shape[1]],
          units: 64,
          activation: 'relu',
          kernelInitializer: 'varianceScaling',
        }),
        tf.layers.dense({
          units: project.classes.length,
          activation: 'softmax',
        }),
      ],
    });
    optimizer = tf.train.adam(project.learningRate);
    head.compile({
      optimizer,
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy'],
    });
    await head.fit(xs, ys, {
      epochs: project.epochs,
      batchSize: Math.min(project.batchSize, total),
      shuffle: true,
      yieldEvery: 'batch',
      callbacks: {
        onBatchEnd: async () => {
          if (signal.aborted) head!.stopTraining = true;
        },
        onEpochEnd: async (epoch, logs) => {
          onProgress({
            percent: 50 + Math.round(((epoch + 1) / project.epochs) * 49),
            message: `Training · epoch ${epoch + 1} / ${project.epochs}`,
            accuracy: logs?.acc,
          });
        },
      },
    });
    check();
    joined = tf.model({
      inputs: base.inputs,
      outputs: head.apply(base.outputs[0]) as tf.SymbolicTensor,
    });
    // Serialize/reload to give the finished model independent ownership of its
    // weights. All temporary models and optimizer slots can then be released.
    const temporary = new ImageModel(joined, {
      labels: project.classes.map((c) => c.name.trim()),
      imageSize: 224,
      tfjsVersion: tf.version.tfjs,
      packageName: '@teachablemachine/image',
      modelName: project.title,
      timeStamp: new Date().toISOString(),
    });
    const saved = await temporary.snapshot(project.id, project.revision);
    check();
    const result = await restore(saved);
    onProgress({ percent: 100, message: 'Model ready. Try it in Preview.' });
    return result;
  } finally {
    xs?.dispose();
    ys?.dispose();
    features.forEach((feature) => feature.dispose());
    // The joined graph owns the shared base layers and nested head. Dispose it
    // once; disposing those models again would double-free their weights.
    if (joined) joined.dispose();
    else {
      head?.dispose();
      base?.dispose();
    }
    optimizer?.dispose();
  }
}
export function modelArchive(saved: SavedModel): Uint8Array {
  const { artifacts } = saved;
  if (!artifacts.weightData || Array.isArray(artifacts.weightData))
    throw new Error('Could not export model weights.');
  return zipSync(
    {
      'model.json': strToU8(
        JSON.stringify({
          modelTopology: artifacts.modelTopology,
          format: 'layers-model',
          generatedBy: `TensorFlow.js ${tf.version.tfjs}`,
          weightsManifest: [
            { paths: ['weights.bin'], weights: artifacts.weightSpecs },
          ],
        }),
      ),
      'weights.bin': new Uint8Array(artifacts.weightData),
      'metadata.json': strToU8(JSON.stringify(saved.metadata, null, 2)),
    },
    { level: 0 },
  );
}
export async function importModelArchive(file: File): Promise<ImageModel> {
  if (file.size > 100 * 1024 * 1024)
    throw new Error('Choose a model ZIP smaller than 100 MB.');
  let total = 0;
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter: (entry) => {
      total += entry.originalSize;
      if (total > 150 * 1024 * 1024)
        throw new Error('This model archive is too large.');
      return true;
    },
  });
  const key = Object.keys(files).find((name) => /(^|\/)model.json$/.test(name));
  if (!key)
    throw new Error(
      'The ZIP must contain model.json, metadata.json, and model weights.',
    );
  const dir = key.slice(0, -'model.json'.length);
  const spec = JSON.parse(strFromU8(files[key]));
  if (!files[dir + 'metadata.json'])
    throw new Error('The model ZIP is missing metadata.json.');
  const metadata = JSON.parse(
    strFromU8(files[dir + 'metadata.json']),
  ) as ModelMetadata;
  const chunks: Uint8Array[] = [];
  const weightSpecs: tf.io.WeightsManifestEntry[] = [];
  for (const group of spec.weightsManifest ?? []) {
    weightSpecs.push(...group.weights);
    for (const path of group.paths) {
      const data = files[dir + path];
      if (!data) throw new Error(`The model ZIP is missing ${path}.`);
      chunks.push(data);
    }
  }
  const merged = new Uint8Array(
    chunks.reduce((sum, c) => sum + c.byteLength, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return restore({
    projectId: '',
    revision: -1,
    metadata,
    artifacts: {
      modelTopology: spec.modelTopology,
      weightSpecs,
      weightData: merged.buffer,
    },
  });
}
