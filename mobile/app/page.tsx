'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import {
  Camera,
  Upload,
  Plus,
  Menu,
  Smartphone,
  ArrowRight,
  Pencil,
  Image as ImageIcon,
  MoreVertical,
  Trash2,
  Download,
  FolderOpen,
  HelpCircle,
  X,
  Check,
  LoaderCircle,
  RotateCcw,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import CameraPanel from '@/components/camera-panel';
import ExportModelDialog from '@/components/export-model-dialog';
import {
  MAX_CLASSES,
  MAX_SAMPLES,
  newProject,
  trainingIssue,
  parseProject,
  readLocal,
  writeLocal,
  downloadFile,
  safeName,
  type Project,
  type ImageClass,
} from '@/lib/project';
import { importImage, decodeImage } from '@/lib/images';
import type { ImageModel, ProgressUpdate, SavedModel } from '@/lib/ml';

type ClassCardProps = {
  item: ImageClass;
  disabled: boolean;
  cameraOpen: boolean;
  removable: boolean;
  onCamera: () => void;
  onClose: () => void;
  onCapture: (data: string) => boolean;
  onUpload: (files: File[]) => void;
  onName: (name: string) => void;
  onDelete: () => void;
  onRemoveSample: (id: string) => void;
  onClear: () => void;
};
function ClassCard({
  item,
  disabled,
  cameraOpen,
  removable,
  onCamera,
  onClose,
  onCapture,
  onUpload,
  onName,
  onDelete,
  onRemoveSample,
  onClear,
}: ClassCardProps) {
  const upload = useRef<HTMLInputElement>(null);
  const name = useRef<HTMLInputElement>(null);
  return (
    <article className={`class-card ${cameraOpen ? 'camera-open' : ''}`}>
      <div className="card-heading">
        <div className="class-title">
          <Input
            ref={name}
            value={item.name}
            aria-label={`Class name: ${item.name}`}
            maxLength={60}
            disabled={disabled}
            onChange={(event) => onName(event.target.value)}
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Rename ${item.name}`}
            disabled={disabled}
            onClick={() => {
              name.current?.focus();
              name.current?.select();
            }}
          >
            <Pencil size={15} />
          </Button>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                disabled={disabled}
                aria-label={`Options for ${item.name}`}
              />
            }
          >
            <MoreVertical />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={!item.samples.length} onClick={onClear}>
              <RotateCcw /> Clear samples
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              disabled={!removable}
              onClick={onDelete}
            >
              <Trash2 /> Delete class
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {cameraOpen && <CameraPanel onClose={onClose} onCapture={onCapture} />}
      <div className="card-body">
        <div className="sample-heading">
          <p className="sample-label">
            {item.samples.length
              ? `${item.samples.length} Image Samples`
              : 'Add Image Samples'}
          </p>
          {item.samples.length > 0 && (
            <span>
              {item.samples.length} / {MAX_SAMPLES}
            </span>
          )}
        </div>
        <div className="sample-content">
          <div className="capture-actions">
            <Button
              variant="secondary"
              disabled={disabled || item.samples.length >= MAX_SAMPLES}
              onClick={onCamera}
            >
              <Camera /> Camera
            </Button>
            <Button
              variant="secondary"
              disabled={disabled || item.samples.length >= MAX_SAMPLES}
              onClick={() => upload.current?.click()}
            >
              <Upload /> Upload
            </Button>
          </div>
          {item.samples.length ? (
            <div
              className="sample-grid"
              aria-label={`Samples for ${item.name}`}
            >
              {item.samples.map((sample, index) => (
                <div className="sample" key={sample.id}>
                  <Image
                    width={224}
                    height={224}
                    unoptimized
                    src={sample.dataUrl}
                    alt={`${item.name} sample ${index + 1}`}
                    loading="lazy"
                  />
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    disabled={disabled}
                    aria-label={`Delete ${item.name} sample ${index + 1}`}
                    onClick={() => onRemoveSample(sample.id)}
                  >
                    <X size={12} />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-samples">
              <ImageIcon size={22} />
              <span>Your examples will appear here</span>
            </div>
          )}
        </div>
        {item.samples.length >= MAX_SAMPLES && (
          <p className="helper">Class full. Remove a sample to add another.</p>
        )}
        <input
          ref={upload}
          type="file"
          className="hidden"
          aria-label={`Upload images for ${item.name}`}
          accept="image/jpeg,image/png,image/webp,image/gif,image/bmp"
          multiple
          onChange={(event) => {
            onUpload(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />
      </div>
    </article>
  );
}

export default function Home() {
  const [project, setProject] = useState<Project>(newProject);
  const current = useRef(project);
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState('Opening project…');
  const saveNumber = useRef(0);
  const [cameraTarget, setCameraTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState<'training' | 'upload' | 'loading' | null>(
    null,
  );
  const busyRef = useRef(false);
  const [progress, setProgress] = useState<ProgressUpdate>({
    percent: 0,
    message: '',
  });
  const [model, setModel] = useState<ImageModel | null>(null);
  const modelRef = useRef<ImageModel | null>(null);
  const [modelRevision, setModelRevision] = useState(-1);
  const [predictions, setPredictions] = useState<number[]>([]);
  const [testImage, setTestImage] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [pendingProject, setPendingProject] = useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    clear: boolean;
  } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const openFile = useRef<HTMLInputElement>(null);
  const modelFile = useRef<HTMLInputElement>(null);
  const imageFile = useRef<HTMLInputElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const saved = await readLocal<Project>('project');
        if (!active) return;
        if (saved) {
          current.current = saved;
          setProject(saved);
        }
        setSaveStatus(saved ? 'Saved on this device' : 'Ready to collect');
        const savedModel = await readLocal<SavedModel>('model');
        if (
          savedModel &&
          savedModel.projectId === (saved?.id ?? current.current.id)
        ) {
          const ml = await import('@/lib/ml');
          const restored = await ml.restore(savedModel);
          if (!active) {
            restored.dispose();
            return;
          }
          modelRef.current = restored;
          setModel(restored);
          setModelRevision(savedModel.revision);
        }
      } catch {
        if (active) {
          setSaveStatus('Device storage unavailable');
          setNotice(
            'Could not restore saved work. Export your project regularly if device storage is unavailable.',
          );
        }
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => {
      active = false;
      controller.current?.abort();
    };
  }, []);

  const save = useCallback(async (next: Project) => {
    const number = ++saveNumber.current;
    setSaveStatus('Saving…');
    try {
      await writeLocal('project', next);
      if (number === saveNumber.current) setSaveStatus('Saved on this device');
    } catch {
      setSaveStatus('Not saved — export a backup');
      setNotice(
        'Device storage is full or unavailable. Use the menu to save a project backup before closing this page.',
      );
    }
  }, []);
  function update(change: (p: Project) => Project, affectsModel = true) {
    const next = change(current.current);
    if (affectsModel) next.revision = current.current.revision + 1;
    current.current = next;
    setProject(next);
    void save(next);
  }
  function changeClass(id: string, change: (c: ImageClass) => ImageClass) {
    update((p) => ({
      ...p,
      classes: p.classes.map((c) => (c.id === id ? change(c) : c)),
    }));
  }
  function capture(id: string, dataUrl: string) {
    const c = current.current.classes.find((c) => c.id === id);
    if (!c || busyRef.current || c.samples.length >= MAX_SAMPLES) return false;
    changeClass(id, (item) => ({
      ...item,
      samples: [...item.samples, { id: crypto.randomUUID(), dataUrl }],
    }));
    return true;
  }
  function begin(task: NonNullable<typeof busy>) {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(task);
    setNotice('');
    setCameraTarget(null);
    return true;
  }
  function finish() {
    busyRef.current = false;
    setBusy(null);
  }
  async function addImages(id: string, files: File[]) {
    if (!files.length || !begin('upload')) return;
    let failed = 0;
    let added = 0;
    try {
      const room =
        MAX_SAMPLES -
        (current.current.classes.find((c) => c.id === id)?.samples.length ??
          MAX_SAMPLES);
      for (const file of files.slice(0, room)) {
        try {
          const dataUrl = await importImage(file);
          changeClass(id, (item) => ({
            ...item,
            samples: [...item.samples, { id: crypto.randomUUID(), dataUrl }],
          }));
          added++;
        } catch {
          failed++;
        }
      }
      if (failed || files.length > room)
        setNotice(
          `Added ${added} samples.${failed ? ` ${failed} files could not be opened; use JPG, PNG, or WebP under 25 MB.` : ''}${files.length > room ? ` Each class holds up to ${MAX_SAMPLES} samples.` : ''}`,
        );
    } finally {
      finish();
    }
  }
  async function installModel(next: ImageModel, revision: number) {
    modelRef.current?.dispose();
    modelRef.current = next;
    setModel(next);
    setModelRevision(revision);
    setPredictions([]);
    setTestImage(null);
    const snapshot = await next.snapshot(current.current.id, revision);
    try {
      await writeLocal('model', snapshot);
    } catch {
      setNotice(
        'The model is ready, but could not be saved on this device. Export it to keep a copy.',
      );
    }
  }
  async function train() {
    const issue = trainingIssue(current.current);
    if (issue) {
      setNotice(issue);
      return;
    }
    if (!begin('training')) return;
    controller.current = new AbortController();
    let wake: { release: () => Promise<void> } | undefined;
    setProgress({ percent: 0, message: 'Starting training…' });
    try {
      await save(current.current);
      try {
        wake = await navigator.wakeLock?.request('screen');
      } catch {
        /* Optional: browser may refuse the wake lock. */
      }
      const ml = await import('@/lib/ml');
      const next = await ml.trainProject(
        current.current,
        setProgress,
        controller.current.signal,
      );
      await installModel(next, current.current.revision);
      setTimeout(
        () =>
          document
            .getElementById('preview')
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
        100,
      );
    } catch (e) {
      const error = e as Error;
      setProgress({
        percent: 0,
        message:
          error.name === 'AbortError'
            ? 'Training stopped. Your samples are saved.'
            : '',
      });
      if (error.name !== 'AbortError')
        setNotice(
          `Training could not finish: ${error.message}. Your samples are kept; try again with fewer samples or a smaller batch size.`,
        );
    } finally {
      await wake?.release().catch(() => {});
      controller.current = null;
      finish();
    }
  }
  async function openModel(file: File) {
    if (!begin('loading')) return;
    try {
      const ml = await import('@/lib/ml');
      const imported = await ml.importModelArchive(file);
      await installModel(imported, -1);
      setImportOpen(false);
      setProgress({ percent: 100, message: 'Imported model ready.' });
    } catch (e) {
      setNotice(`Could not load this model: ${(e as Error).message}`);
    } finally {
      finish();
    }
  }
  function exportProject() {
    downloadFile(
      `${safeName(current.current.title)}.tmproject.json`,
      new Blob([JSON.stringify(current.current)], { type: 'application/json' }),
    );
  }
  async function openProject(file: File) {
    try {
      if (file.size > 100 * 1024 * 1024)
        throw new Error('Choose a project smaller than 100 MB.');
      setPendingProject(parseProject(JSON.parse(await file.text())));
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  async function replaceProject(next: Project) {
    setCameraTarget(null);
    modelRef.current?.dispose();
    modelRef.current = null;
    setModel(null);
    setModelRevision(-1);
    setPredictions([]);
    setTestImage(null);
    setProgress({ percent: 0, message: '' });
    current.current = next;
    setProject(next);
    await save(next);
    try {
      await writeLocal('model', null);
    } catch {
      /* Project id prevents an old model from being restored. */
    }
    setConfirmNew(false);
    setPendingProject(null);
  }
  async function predictFile(file: File) {
    if (!modelRef.current || !begin('loading')) return;
    try {
      const data = await importImage(file);
      setTestImage(data);
      const image = await decodeImage(data);
      setPredictions(await modelRef.current.predict(image));
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      finish();
    }
  }
  const locked = !loaded || !!busy;
  const issue = trainingIssue(project);
  const stale =
    model && modelRevision >= 0 && project.revision !== modelRevision;
  const total = project.classes.reduce(
    (count, c) => count + c.samples.length,
    0,
  );
  const colors = [
    '#e98126',
    '#9b51c9',
    '#2e8e5b',
    '#d24a67',
    '#2979d8',
    '#998100',
    '#008b8b',
    '#6953b7',
  ];

  return (
    <main>
      <h1 className="sr-only">Teachable Machine Mobile image project</h1>
      <header className="topbar">
        <div className="brand">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Project menu"
                  disabled={locked}
                />
              }
            >
              <Menu size={23} />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="project-menu">
              <DropdownMenuItem onClick={() => setConfirmNew(true)}>
                <Plus /> New project
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openFile.current?.click()}>
                <FolderOpen /> Open project
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportProject}>
                <Download /> Save project backup
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setImportOpen(true)}>
                <Upload /> Load an existing model
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setHelpOpen(true)}>
                <HelpCircle /> How it works
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <span>
            Teachable Machine <small>Mobile</small>
          </span>
        </div>
        <span className="local-badge">
          <Smartphone size={15} /> On your device
        </span>
      </header>
      <div className="projectbar">
        <div className="project-name">
          <span className="eyebrow">IMAGE PROJECT</span>
          <div className="title-row">
            <Input
              ref={titleInput}
              value={project.title}
              aria-label="Project name"
              maxLength={100}
              disabled={locked}
              onChange={(event) =>
                update((p) => ({ ...p, title: event.target.value }), false)
              }
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Rename project"
              disabled={locked}
              onClick={() => {
                titleInput.current?.focus();
                titleInput.current?.select();
              }}
            >
              <Pencil size={16} />
            </Button>
          </div>
        </div>
        <output className="save-note">
          {saveStatus === 'Saved on this device' && <Check size={13} />}{' '}
          {saveStatus}
        </output>
      </div>
      <nav className="steps" aria-label="Project steps">
        <a href="#samples">
          <b>1</b> Gather <span className="step-count">{total || ''}</span>
        </a>
        <ArrowRight size={16} />
        <a href="#training">
          <b>2</b> Train
        </a>
        <ArrowRight size={16} />
        <a href="#preview">
          <b>3</b> Preview
        </a>
      </nav>
      <div className="workspace">
        <section
          id="samples"
          className="samples-column"
          aria-label="Image classes"
        >
          {project.classes.map((item) => (
            <ClassCard
              key={item.id}
              item={item}
              disabled={locked}
              removable={project.classes.length > 2}
              cameraOpen={cameraTarget === item.id}
              onCamera={() => setCameraTarget(item.id)}
              onClose={() => setCameraTarget(null)}
              onCapture={(data) => capture(item.id, data)}
              onUpload={(files) => void addImages(item.id, files)}
              onName={(name) => changeClass(item.id, (c) => ({ ...c, name }))}
              onRemoveSample={(id) =>
                changeClass(item.id, (c) => ({
                  ...c,
                  samples: c.samples.filter((s) => s.id !== id),
                }))
              }
              onClear={() => setDeleteTarget({ id: item.id, clear: true })}
              onDelete={() => setDeleteTarget({ id: item.id, clear: false })}
            />
          ))}
          <Button
            variant="outline"
            className="add-class"
            disabled={locked || project.classes.length >= MAX_CLASSES}
            onClick={() =>
              update((p) => ({
                ...p,
                classes: [
                  ...p.classes,
                  {
                    id: crypto.randomUUID(),
                    name: `Class ${p.classes.length + 1}`,
                    samples: [],
                  },
                ],
              }))
            }
          >
            <Plus />{' '}
            {project.classes.length >= MAX_CLASSES
              ? '8 classes maximum'
              : 'Add a class'}
          </Button>
          <p className="helper">
            Try 20–50 varied samples per class. Change the angle, lighting, and
            background.
          </p>
        </section>
        <section
          id="training"
          className="panel training-panel"
          aria-labelledby="training-title"
        >
          <div className="card-heading">
            <h2 id="training-title">Training</h2>
            {model && !stale && (
              <CheckCircle2 size={18} className="success-icon" />
            )}
          </div>
          <div className="card-body">
            <Button
              className="train-button"
              disabled={locked || !!issue}
              onClick={() => void train()}
            >
              {busy === 'training' ? (
                <>
                  <LoaderCircle className="spin" /> Training…
                </>
              ) : model ? (
                'Train Again'
              ) : (
                'Train Model'
              )}
            </Button>
            {busy === 'training' ? (
              <div className="training-progress">
                <Progress
                  value={progress.percent}
                  aria-label="Training progress"
                />
                <output className="progress-message">{progress.message}</output>
                {progress.accuracy !== undefined && (
                  <p>
                    Training accuracy: {Math.round(progress.accuracy * 100)}%{' '}
                    <span className="metric-note">on collected samples</span>
                  </p>
                )}
                <p className="helper">
                  Keep this tab open. Your screen will stay awake when
                  supported.
                </p>
                <Button
                  variant="outline"
                  onClick={() => controller.current?.abort()}
                >
                  Stop training
                </Button>
              </div>
            ) : (
              <>
                <p className="helper">
                  {issue ||
                    (stale
                      ? 'Samples or labels changed. Train again to update your model.'
                      : progress.message ||
                        `${total} samples · ${project.classes.length} classes. Ready to train.`)}
                </p>
                <p className="privacy-note">
                  <Smartphone size={14} /> Training happens on your device.
                </p>
              </>
            )}
          </div>
          <details className="advanced">
            <summary>Advanced</summary>
            <div className="settings">
              <label htmlFor="epochs">
                Epochs{' '}
                <Input
                  id="epochs"
                  type="number"
                  min={1}
                  max={100}
                  value={project.epochs}
                  disabled={locked}
                  onChange={(e) =>
                    update(
                      (p) => ({
                        ...p,
                        epochs: Math.max(
                          1,
                          Math.min(
                            100,
                            Math.round(Number(e.target.value)) || 1,
                          ),
                        ),
                      }),
                      false,
                    )
                  }
                />
              </label>
              <label htmlFor="batch-size">
                Batch size{' '}
                <Select
                  value={String(project.batchSize)}
                  disabled={locked}
                  onValueChange={(v) =>
                    update((p) => ({ ...p, batchSize: Number(v) }), false)
                  }
                >
                  <SelectTrigger id="batch-size" aria-label="Batch size">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[4, 8, 16, 32].map((n) => (
                      <SelectItem value={String(n)} key={n}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label htmlFor="learning-rate">
                Learning rate{' '}
                <Select
                  value={String(project.learningRate)}
                  disabled={locked}
                  onValueChange={(v) =>
                    update((p) => ({ ...p, learningRate: Number(v) }), false)
                  }
                >
                  <SelectTrigger id="learning-rate" aria-label="Learning rate">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[0.0001, 0.001, 0.01].map((n) => (
                      <SelectItem value={String(n)} key={n}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <p className="helper">
                A smaller batch uses less memory. More epochs repeat the
                training; they do not always improve recognition.
              </p>
            </div>
          </details>
        </section>
        <section
          id="preview"
          className="panel preview-panel"
          aria-labelledby="preview-title"
        >
          <div className="card-heading">
            <h2 id="preview-title">Preview</h2>
            <Button
              variant="secondary"
              disabled={locked || !model}
              onClick={() => {
                setCameraTarget(null);
                setExportOpen(true);
              }}
            >
              <Upload /> Export Model
            </Button>
          </div>
          {model ? (
            <>
              <div className="preview-controls">
                <Button
                  variant={cameraTarget === 'preview' ? 'default' : 'secondary'}
                  disabled={locked}
                  onClick={() => {
                    setTestImage(null);
                    setCameraTarget('preview');
                  }}
                >
                  <Camera /> Camera
                </Button>
                <Button
                  variant="secondary"
                  disabled={locked}
                  onClick={() => imageFile.current?.click()}
                >
                  <ImageIcon /> Image
                </Button>
              </div>
              {stale && (
                <p className="stale-note">
                  Showing your previous model. Train again to include your
                  changes.
                </p>
              )}
              {modelRevision === -1 && (
                <p className="helper imported-note">Using an imported model.</p>
              )}
              {cameraTarget === 'preview' ? (
                <CameraPanel
                  model={model}
                  onClose={() => setCameraTarget(null)}
                  onPrediction={setPredictions}
                />
              ) : testImage ? (
                <Image
                  width={224}
                  height={224}
                  unoptimized
                  className="test-image"
                  src={testImage}
                  alt="Selected test sample"
                />
              ) : (
                <div className="preview-ready">
                  <Camera size={30} />
                  <p>Turn on the camera or choose an image.</p>
                </div>
              )}
              <div className="prediction-list">
                <p className="output-label">OUTPUT</p>
                {model.metadata.labels.map((label, index) => (
                  <div className="prediction" key={`${index}-${label}`}>
                    <div>
                      <span style={{ color: colors[index % colors.length] }}>
                        {label}
                      </span>
                      <span>
                        {predictions.length
                          ? `${Math.round((predictions[index] ?? 0) * 100)}%`
                          : '—'}
                      </span>
                    </div>
                    <Progress
                      value={(predictions[index] ?? 0) * 100}
                      aria-label={`${label} confidence`}
                      style={
                        {
                          '--primary': colors[index % colors.length],
                        } as React.CSSProperties
                      }
                    />
                  </div>
                ))}
                <p className="helper">
                  Confidence is the model’s estimate, not a guarantee.
                </p>
              </div>
            </>
          ) : (
            <div className="preview-empty">
              <div className="preview-symbol">
                <Camera size={28} />
              </div>
              <h3>See what your model learns</h3>
              <p>Train a model, then try it with your camera or an image.</p>
              <Button
                variant="link"
                disabled={locked}
                onClick={() => setImportOpen(true)}
              >
                Or load an existing model
              </Button>
            </div>
          )}
        </section>
      </div>
      <footer>
        <span>
          Built with TensorFlow.js · Independent adaptation for mobile.
        </span>
        <a
          href="https://teachablemachine.withgoogle.com/"
          target="_blank"
          rel="noreferrer"
        >
          Original Teachable Machine ↗
        </a>
      </footer>
      {busy && busy !== 'training' && (
        <output className="work-status">
          <LoaderCircle className="spin" size={17} />
          {busy === 'upload' ? 'Adding your images…' : 'Loading…'}
        </output>
      )}
      {notice && (
        <div className="notice" role="alert">
          <span>{notice}</span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Dismiss message"
            onClick={() => setNotice('')}
          >
            <X />
          </Button>
        </div>
      )}
      <input
        ref={openFile}
        type="file"
        accept=".json"
        className="hidden"
        aria-label="Open project file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void openProject(file);
          event.target.value = '';
        }}
      />
      <input
        ref={modelFile}
        type="file"
        accept=".zip"
        className="hidden"
        aria-label="Open model ZIP"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void openModel(file);
          event.target.value = '';
        }}
      />
      <input
        ref={imageFile}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/bmp"
        className="hidden"
        aria-label="Choose image to classify"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void predictFile(file);
          event.target.value = '';
        }}
      />
      {exportOpen && model && (
        <ExportModelDialog
          open={exportOpen}
          onOpenChange={setExportOpen}
          model={model}
          projectId={project.id}
          revision={modelRevision}
          title={project.title}
          stale={modelRevision >= 0 && modelRevision !== project.revision}
        />
      )}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="help-dialog">
          <DialogTitle>Teach your phone something new</DialogTitle>
          <DialogDescription>
            Collect examples, train locally, and test what it learned.
          </DialogDescription>
          <ol>
            <li>
              <b>Gather.</b> Rename each class and add images with Camera or
              Upload. Hold the record button for a burst. Include a “Background”
              class if you want to recognize when nothing is there.
            </li>
            <li>
              <b>Train.</b> Start with 20–50 varied samples per class. Keep the
              tab open while training.
            </li>
            <li>
              <b>Preview.</b> Try new examples with the camera. Add more samples
              when it gets something wrong.
            </li>
          </ol>
          <p>
            Samples and models are saved in this browser on this device. They
            are not uploaded. Clearing site data removes them, so use{' '}
            <b>Save project backup</b> from the menu. Backups include samples;
            export your trained model separately.
          </p>
          <p>
            Export Model opens a panel with your TensorFlow.js ZIP, JavaScript
            and p5.js code, and instructions for using the model in a project.
          </p>
          <Button onClick={() => setHelpOpen(false)}>Got it</Button>
        </DialogContent>
      </Dialog>
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogTitle>Load an image model</DialogTitle>
          <DialogDescription>
            Choose a TensorFlow.js model ZIP exported here or from Teachable
            Machine. It should contain model.json, metadata.json, and its
            weights.
          </DialogDescription>
          <p className="helper">
            Your samples stay in this project. The imported model replaces the
            current preview model.
          </p>
          <Button disabled={locked} onClick={() => modelFile.current?.click()}>
            <FolderOpen /> Choose model ZIP
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={confirmNew || !!pendingProject}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmNew(false);
            setPendingProject(null);
          }
        }}
      >
        <DialogContent>
          <DialogTitle>
            {pendingProject ? 'Open this project?' : 'Start a new project?'}
          </DialogTitle>
          <DialogDescription>
            This replaces the project saved on this device. Download a backup
            first if you want to keep your current samples.
          </DialogDescription>
          <Button variant="outline" onClick={exportProject}>
            <Download /> Save current project backup
          </Button>
          <Button
            onClick={() => void replaceProject(pendingProject ?? newProject())}
          >
            {pendingProject ? 'Open project' : 'Start new project'}
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogTitle>
            {deleteTarget?.clear
              ? 'Clear these samples?'
              : 'Delete this class?'}
          </DialogTitle>
          <DialogDescription>
            The samples in this class will be removed from your saved project.
          </DialogDescription>
          <Button
            variant="destructive"
            onClick={() => {
              if (!deleteTarget) return;
              if (deleteTarget.clear)
                changeClass(deleteTarget.id, (c) => ({ ...c, samples: [] }));
              else
                update((p) => ({
                  ...p,
                  classes: p.classes.filter((c) => c.id !== deleteTarget.id),
                }));
              setDeleteTarget(null);
            }}
          >
            Delete
          </Button>
        </DialogContent>
      </Dialog>
    </main>
  );
}
