import type { BuildProgress, BuildResult, Design } from '../domain/types';
import { buildDesign } from './build';

interface BuildHandlers {
  onProgress: (progress: BuildProgress) => void;
  onResult: (result: BuildResult) => void;
  onError: (message: string) => void;
}

export function requestBuild(design: Design, handlers: BuildHandlers): () => void {
  const id = 1;
  let settled = false;
  let worker: Worker | null = null;
  const finish = () => {
    settled = true;
    window.clearTimeout(timer);
  };
  const timer = window.setTimeout(() => {
    worker?.terminate();
    if (!settled) {
      finish();
      handlers.onError('Building took too long and was stopped. Lower the resolution or simplify the trace, then try again.');
    }
  }, 45000);

  try {
    worker = new Worker(new URL('../workers/geometry.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    buildDesign(design, handlers.onProgress).then(handlers.onResult, (error: unknown) => {
      handlers.onError(error instanceof Error ? error.message : 'The model could not be built.');
    });
    return () => undefined;
  }

  worker.onmessage = (event: MessageEvent) => {
    const message = event.data as { id: number; result?: BuildResult; error?: string; progress?: BuildProgress };
    if (!message || message.id !== id || settled) return;
    if (message.progress) {
      handlers.onProgress(message.progress);
      return;
    }
    finish();
    worker?.terminate();
    if (message.error) handlers.onError(message.error);
    else if (message.result) handlers.onResult(message.result);
  };
  worker.onerror = () => {
    if (settled) return;
    finish();
    worker?.terminate();
    buildDesign(design, handlers.onProgress).then(handlers.onResult, (error: unknown) => {
      handlers.onError(error instanceof Error ? error.message : 'The model could not be built.');
    });
  };
  worker.postMessage({ id, design });
  return () => {
    finish();
    worker?.terminate();
  };
}
