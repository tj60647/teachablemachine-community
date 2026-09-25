'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Download, FileCode, LoaderCircle } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { modelExample, type SnippetLanguage } from '@/lib/export-snippets';
import { safeName } from '@/lib/project';
import type { ImageModel } from '@/lib/ml';

type DownloadLinks = {
  model: string;
  javascript: string;
  p5: string;
  bytes: number;
};

export default function ExportModelDialog({
  open,
  onOpenChange,
  model,
  projectId,
  revision,
  title,
  stale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  model: ImageModel;
  projectId: string;
  revision: number;
  title: string;
  stale: boolean;
}) {
  const [links, setLinks] = useState<DownloadLinks | null>(null);
  const [error, setError] = useState('');
  const [copyError, setCopyError] = useState('');
  const [language, setLanguage] = useState<SnippetLanguage>('javascript');
  const [copied, setCopied] = useState<SnippetLanguage | null>(null);
  const [downloadRequested, setDownloadRequested] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    async function prepare() {
      try {
        const { modelArchive } = await import('@/lib/ml');
        if (cancelled) return;
        const snapshot = await model.snapshot(projectId, revision);
        if (cancelled) return;
        const archive = modelArchive(snapshot);
        const addUrl = (blob: Blob) => {
          const url = URL.createObjectURL(blob);
          urls.push(url);
          return url;
        };
        setLinks({
          model: addUrl(
            new Blob([new Uint8Array(archive)], { type: 'application/zip' }),
          ),
          javascript: addUrl(
            new Blob([modelExample('javascript')], { type: 'text/html' }),
          ),
          p5: addUrl(new Blob([modelExample('p5')], { type: 'text/html' })),
          bytes: archive.byteLength,
        });
      } catch (cause) {
        if (!cancelled)
          setError(
            `Could not prepare the download: ${(cause as Error).message}`,
          );
      }
    }
    void prepare();
    return () => {
      cancelled = true;
      // Chrome may still be consuming a download when the panel closes.
      setTimeout(() => urls.forEach((url) => URL.revokeObjectURL(url)), 30000);
    };
  }, [model, projectId, revision, retry]);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(modelExample(language));
      setCopied(language);
      setCopyError('');
    } catch {
      setCopyError(
        'Could not copy. You can select the code below or download the example HTML.',
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="export-dialog">
        <div className="export-header">
          <DialogTitle>Export your model to use it in projects.</DialogTitle>
          <DialogDescription>
            Download your trained model and the code to use it.
          </DialogDescription>
          <div className="export-format">TensorFlow.js</div>
        </div>
        <div className="export-body">
          {stale && (
            <p className="export-warning">
              Your samples or labels changed after training. This exports the
              last trained model. Train again to include your changes.
            </p>
          )}
          <h3>Export your model</h3>
          <div className="export-download-row">
            <span className="export-method">
              <Check size={18} /> Download
            </span>
            {links ? (
              <a
                className={buttonVariants({
                  className: 'export-download-button',
                })}
                href={links.model}
                download={`${safeName(title)}-model.zip`}
                onClick={() => setDownloadRequested(true)}
              >
                <Download /> Download my model
              </a>
            ) : (
              <Button disabled className="export-download-button">
                {error ? <Download /> : <LoaderCircle className="spin" />}{' '}
                {error ? 'Download unavailable' : 'Preparing model…'}
              </Button>
            )}
          </div>
          <p className="export-file-details">
            ZIP containing <code>model.json</code>, <code>weights.bin</code>,
            and <code>metadata.json</code>
            {links && <> · {(links.bytes / (1024 * 1024)).toFixed(1)} MB</>}.
          </p>
          <p className="export-subtle">
            Contains your trained model and class labels. Save a project backup
            separately to keep your training samples.
          </p>
          {downloadRequested && (
            <output className="export-status">
              Download requested. In Chrome on your phone, open ⋮ → Downloads to
              find the ZIP.
            </output>
          )}
          {error && (
            <div className="export-error" role="alert">
              <p>{error}</p>
              {!links && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setError('');
                    setLinks(null);
                    setRetry((value) => value + 1);
                  }}
                >
                  Try again
                </Button>
              )}
            </div>
          )}
          <h3 className="export-code-heading">
            Code snippets to use your model
          </h3>
          <Tabs
            value={language}
            onValueChange={(value) => {
              setLanguage(value as SnippetLanguage);
              setCopied(null);
            }}
          >
            <TabsList
              variant="line"
              className="export-code-tabs"
              aria-label="Code language"
            >
              <TabsTrigger value="javascript">JavaScript</TabsTrigger>
              <TabsTrigger value="p5">p5.js</TabsTrigger>
            </TabsList>
            <ol className="export-instructions">
              <li>
                Extract the three files from your model ZIP into a folder named{' '}
                <code>my_model</code>.
              </li>
              <li>
                Save the example below as <code>index.html</code>, next to that
                folder.
              </li>
              <li>
                Serve them over HTTPS, or localhost on a computer. Open the page
                and tap <b>Start camera</b>.
              </li>
            </ol>
            <p className="export-subtle">
              Opening the HTML directly as a file will not load the model. The
              examples download their JavaScript libraries from the internet.
            </p>
            <div className="export-code-actions">
              <Button variant="outline" onClick={() => void copyCode()}>
                {copied === language ? <Check /> : <Copy />}
                {copied === language ? 'Copied' : 'Copy code'}
              </Button>
              {links && (
                <a
                  className={buttonVariants({ variant: 'outline' })}
                  href={links[language]}
                  download="index.html"
                >
                  <FileCode /> Download example HTML
                </a>
              )}
              <output className="sr-only">
                {copied === language ? 'Code copied to clipboard.' : ''}
              </output>
            </div>
            {copyError && (
              <p className="export-error" role="alert">
                {copyError}
              </p>
            )}
            {(['javascript', 'p5'] as const).map((value) => (
              <TabsContent key={value} value={value}>
                <textarea
                  className="export-code"
                  aria-label={`${value === 'p5' ? 'p5.js' : 'JavaScript'} example code`}
                  readOnly
                  spellCheck={false}
                  rows={14}
                  wrap="off"
                  value={modelExample(value)}
                />
              </TabsContent>
            ))}
          </Tabs>
          <p className="export-subtle export-limitations">
            This version exports TensorFlow.js files. Hosted share links,
            TensorFlow, and TensorFlow Lite exports are not available yet.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
