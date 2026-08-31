let _bridgeReady = false;

function isBridgeCallable(): boolean {
  return typeof window.pywebview?.api?.ping === "function";
}

export function waitForBridge(timeoutMs = 8_000): Promise<void> {
  if (_bridgeReady) return Promise.resolve();

  return new Promise((resolve, reject) => {
    if (isBridgeCallable()) {
      _bridgeReady = true;
      resolve();
      return;
    }

    const POLL_MS = 50;
    let elapsed = 0;

    const timer = setInterval(() => {
      if (isBridgeCallable()) {
        clearInterval(timer);
        _bridgeReady = true;
        resolve();
        return;
      }

      elapsed += POLL_MS;
      if (elapsed >= timeoutMs) {
        clearInterval(timer);
        reject(
          new Error(
            `[api] pywebview bridge did not become ready within ${timeoutMs}ms.`
          )
        );
      }
    }, POLL_MS);
  });
}

export function bridge(): Window["pywebview"]["api"] {
  if (!_bridgeReady || !window.pywebview?.api) {
    throw new Error(
      "[api] Bridge is not ready. Await waitForBridge() before calling the API."
    );
  }
  return window.pywebview.api;
}