export type EditorSaveGate = {
  reset: () => void;
  run: <T>(signature: string, operation: (idempotencyKey: string) => Promise<T>) => Promise<T>;
};

export function createEditorSaveGate(
  createIdempotencyKey: () => string = () => crypto.randomUUID(),
): EditorSaveGate {
  let attempt: { idempotencyKey: string; signature: string } | null = null;
  let flight: Promise<unknown> | null = null;

  return {
    reset() {
      attempt = null;
      flight = null;
    },
    run<T>(signature: string, operation: (idempotencyKey: string) => Promise<T>): Promise<T> {
      if (flight) return flight as Promise<T>;
      if (attempt?.signature !== signature) {
        attempt = { idempotencyKey: createIdempotencyKey(), signature };
      }
      const activeAttempt = attempt;
      const operationFlight = Promise.resolve()
        .then(() => operation(activeAttempt.idempotencyKey))
        .then((result) => {
          if (attempt === activeAttempt) attempt = null;
          return result;
        });
      const trackedFlight = operationFlight.finally(() => {
        if (flight === trackedFlight) flight = null;
      });
      flight = trackedFlight;
      return trackedFlight;
    },
  };
}
