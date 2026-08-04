export function assertNever(value: never, message = 'Unhandled API variant'): never {
  throw new Error(`${message}: ${String(value)}`);
}
