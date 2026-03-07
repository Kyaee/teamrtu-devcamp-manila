type DispatchSmsInput = {
  to: string;
  message: string;
};

/**
 * Semaphore integration should live here. MVP uses a safe stub.
 */
export async function dispatchSmsFallback(
  input: DispatchSmsInput,
): Promise<{ ok: boolean }> {
  console.info("SMS fallback queued", input);
  return { ok: true };
}
