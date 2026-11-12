import { buildDesign } from '../geometry/build';
import type { BuildResult, Design } from '../domain/types';

interface RequestMessage {
  id: number;
  design: Design;
}

export interface WorkerResponse {
  id: number;
  result?: BuildResult;
  error?: string;
  progress?: { index: number; total: number; label: string };
}

self.onmessage = (event: MessageEvent<RequestMessage>) => {
  const { id, design } = event.data;
  buildDesign(design, (progress) => {
    const message: WorkerResponse = { id, progress };
    self.postMessage(message);
  }).then(
    (result) => {
      const message: WorkerResponse = { id, result };
      self.postMessage(message);
    },
    (error: unknown) => {
      const message: WorkerResponse = {
        id,
        error: error instanceof Error ? error.message : 'The model could not be built.',
      };
      self.postMessage(message);
    },
  );
};
