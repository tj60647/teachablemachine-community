'use client';
import { useEffect, useRef, useState } from 'react';
import { Camera, SwitchCamera, X, Circle, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { squareCanvas } from '@/lib/images';
import type { ImageModel } from '@/lib/ml';

type Props = {
  onClose: () => void;
  onCapture?: (dataUrl: string) => boolean;
  model?: ImageModel;
  onPrediction?: (values: number[]) => void;
};
export default function CameraPanel({
  onClose,
  onCapture,
  model,
  onPrediction,
}: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const recording = useRef(false);
  const captureCallback = useRef(onCapture);
  const predictionCallback = useRef(onPrediction);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    captureCallback.current = onCapture;
    predictionCallback.current = onPrediction;
  }, [onCapture, onPrediction]);
  function stopRecording() {
    recording.current = false;
    clearTimeout(timer.current);
    setIsRecording(false);
  }
  useEffect(() => {
    let cancelled = false;
    async function open() {
      try {
        if (!window.isSecureContext)
          throw new Error(
            'Open this app through its HTTPS link to use the camera.',
          );
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error(
            'Camera access is unavailable. You can still upload images.',
          );
        const media = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 24, max: 30 },
          },
        });
        if (cancelled) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        stream.current = media;
        const element = video.current;
        if (!element) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        element.srcObject = media;
        await element.play();
        if (!cancelled) {
          setReady(true);
          setError('');
        }
        media.getVideoTracks().forEach((track) => {
          track.onended = () => {
            if (!cancelled) {
              setReady(false);
              setError('The camera stopped. Tap Retry camera to reconnect.');
            }
          };
        });
      } catch (e) {
        if (cancelled) return;
        const name = (e as Error).name;
        setError(
          name === 'NotAllowedError'
            ? 'Camera permission was denied. Allow camera access in Chrome’s site settings, then retry.'
            : name === 'NotReadableError'
              ? 'Your camera is busy. Close other apps using it, then retry.'
              : name === 'NotFoundError'
                ? 'No camera was found. Try uploading images instead.'
                : (e as Error).message,
        );
      }
    }
    void open();
    function pauseWhenHidden() {
      if (document.hidden) {
        stopRecording();
        stream.current?.getTracks().forEach((track) => track.stop());
        stream.current = null;
        setReady(false);
      } else {
        setAttempt((value) => value + 1);
      }
    }
    window.addEventListener('blur', stopRecording);
    document.addEventListener('visibilitychange', pauseWhenHidden);
    return () => {
      cancelled = true;
      recording.current = false;
      clearTimeout(timer.current);
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
      window.removeEventListener('blur', stopRecording);
      document.removeEventListener('visibilitychange', pauseWhenHidden);
    };
  }, [facing, attempt]);

  useEffect(() => {
    if (!ready || !model) return;
    let cancelled = false;
    let next: ReturnType<typeof setTimeout>;
    async function predict() {
      if (cancelled || !video.current || video.current.readyState < 2) {
        if (!cancelled) next = setTimeout(predict, 200);
        return;
      }
      try {
        const values = await model!.predict(video.current, facing === 'user');
        if (!cancelled) predictionCallback.current?.(values);
      } catch {
        if (!cancelled) {
          setError(
            'Preview stopped. Close and reopen the camera to try again.',
          );
          return;
        }
      }
      if (!cancelled) next = setTimeout(predict, 180);
    }
    void predict();
    return () => {
      cancelled = true;
      clearTimeout(next);
    };
  }, [ready, model, facing]);

  function captureOne() {
    if (!video.current || !ready) return false;
    try {
      return (
        captureCallback.current?.(
          squareCanvas(video.current, 224, facing === 'user').toDataURL(
            'image/jpeg',
            0.9,
          ),
        ) ?? false
      );
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }
  function captureLoop() {
    if (!recording.current) return;
    if (!captureOne()) {
      stopRecording();
      return;
    }
    timer.current = setTimeout(captureLoop, 180);
  }
  return (
    <div className="camera-panel">
      <div className="camera-toolbar">
        <span>
          <Camera size={16} /> {model ? 'Live camera' : 'Camera'}
        </span>
        <div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Switch front and rear camera"
            onClick={() => {
              stopRecording();
              setReady(false);
              setError('');
              setFacing((value) =>
                value === 'environment' ? 'user' : 'environment',
              );
            }}
          >
            <SwitchCamera />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close camera"
            onClick={onClose}
          >
            <X />
          </Button>
        </div>
      </div>
      <div className="camera-view">
        <video
          ref={video}
          autoPlay
          playsInline
          muted
          className={facing === 'user' ? 'mirrored' : ''}
        />
        {!ready && !error && (
          <div className="camera-overlay">
            <LoaderCircle className="spin" />
            <span>Starting camera…</span>
          </div>
        )}
        {ready && (
          <span className="camera-live">
            <i /> LIVE
          </span>
        )}
      </div>
      {error && (
        <div className="camera-error" role="alert">
          <p>{error}</p>
          <Button
            variant="outline"
            onClick={() => {
              setReady(false);
              setError('');
              setAttempt((value) => value + 1);
            }}
          >
            Retry camera
          </Button>
        </div>
      )}
      {onCapture && (
        <>
          <Button
            className={`record-button ${isRecording ? 'recording' : ''}`}
            disabled={!ready}
            onContextMenu={(event) => event.preventDefault()}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              recording.current = true;
              setIsRecording(true);
              captureLoop();
            }}
            onPointerUp={stopRecording}
            onPointerCancel={stopRecording}
            onLostPointerCapture={stopRecording}
            onClick={(event) => {
              if (event.detail === 0) captureOne();
            }}
          >
            <Circle size={16} fill="currentColor" />
            {isRecording ? 'Recording… release to stop' : 'Hold to Record'}
          </Button>
          <p className="camera-tip">Tap for one sample. Hold for a burst.</p>
        </>
      )}
    </div>
  );
}
