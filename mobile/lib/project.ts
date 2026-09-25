export const MAX_CLASSES = 8;
export const MAX_SAMPLES = 200;
export const MIN_SAMPLES = 5;
export type Sample = { id: string; dataUrl: string };
export type ImageClass = { id: string; name: string; samples: Sample[] };
export type Project = {
  version: 1;
  id: string;
  title: string;
  classes: ImageClass[];
  revision: number;
  epochs: number;
  batchSize: number;
  learningRate: number;
};
export function newProject(): Project {
  return {
    version: 1,
    id: crypto.randomUUID(),
    title: 'Untitled project',
    revision: 0,
    epochs: 30,
    batchSize: 16,
    learningRate: 0.001,
    classes: [1, 2].map((n) => ({
      id: crypto.randomUUID(),
      name: `Class ${n}`,
      samples: [],
    })),
  };
}
export function trainingIssue(project: Project): string | null {
  if (project.classes.length < 2) return 'Add at least two classes.';
  if (project.classes.some((c) => !c.name.trim()))
    return 'Give every class a name.';
  if (
    new Set(project.classes.map((c) => c.name.trim().toLowerCase())).size !==
    project.classes.length
  )
    return 'Give each class a different name.';
  if (project.classes.some((c) => c.samples.length < MIN_SAMPLES))
    return `Add at least ${MIN_SAMPLES} samples to each class to begin.`;
  return null;
}
export function parseProject(value: unknown): Project {
  const p = value as Project;
  if (
    !p ||
    p.version !== 1 ||
    typeof p.title !== 'string' ||
    p.title.length > 100 ||
    !Array.isArray(p.classes) ||
    p.classes.length < 2 ||
    p.classes.length > MAX_CLASSES
  )
    throw new Error('This is not a supported mobile project file.');
  for (const c of p.classes) {
    if (
      !c ||
      typeof c.name !== 'string' ||
      c.name.length > 60 ||
      !Array.isArray(c.samples) ||
      c.samples.length > MAX_SAMPLES
    )
      throw new Error('The project contains invalid classes.');
    for (const s of c.samples)
      if (
        !s ||
        typeof s.dataUrl !== 'string' ||
        !/^data:image\/(jpeg|png|webp);base64,/.test(s.dataUrl) ||
        s.dataUrl.length > 150000
      )
        throw new Error('The project contains an unsupported image.');
  }
  return {
    ...newProject(),
    title: p.title,
    classes: p.classes.map((c) => ({
      id: crypto.randomUUID(),
      name: c.name,
      samples: c.samples.map((s) => ({
        id: crypto.randomUUID(),
        dataUrl: s.dataUrl,
      })),
    })),
    epochs: Math.max(1, Math.min(100, Number(p.epochs) || 30)),
    batchSize: [4, 8, 16, 32].includes(p.batchSize) ? p.batchSize : 16,
    learningRate: [0.0001, 0.001, 0.01].includes(p.learningRate)
      ? p.learningRate
      : 0.001,
  };
}

let database: Promise<IDBDatabase> | undefined;
function openDatabase() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('teachable-machine-mobile', 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore('workspace');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      database = undefined;
      reject(request.error);
    };
  });
  return database;
}
export async function readLocal<T>(key: string): Promise<T | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db
      .transaction('workspace')
      .objectStore('workspace')
      .get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}
export async function writeLocal(key: string, value: unknown): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('workspace', 'readwrite');
    transaction.objectStore('workspace').put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('Saving was interrupted.'));
  });
}
export function downloadFile(name: string, data: Blob) {
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export function safeName(title: string) {
  return (
    title
      .trim()
      .replace(/[^a-z0-9_-]+/gi, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'my-model'
  );
}
