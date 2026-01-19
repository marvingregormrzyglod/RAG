// static/hello-world/src/utils/forgeBridge.js
// Minimal Forge bridge wrapper that waits for window.__bridge to initialise before issuing calls.

const BRIDGE_READY_TIMEOUT_MS = 10000;
const BRIDGE_READY_POLL_MS = 25;

let modulePromise = null;
let readyPromise = null;

const waitForReady = () => {
  if (readyPromise) {
    return readyPromise;
  }

  readyPromise = new Promise((resolve, reject) => {
    const started = Date.now();

    const check = () => {
      const bridge = typeof window !== 'undefined' ? window.__bridge : undefined;
      if (bridge && typeof bridge.callBridge === 'function') {
        resolve();
        return;
      }

      if (Date.now() - started > BRIDGE_READY_TIMEOUT_MS) {
        reject(new Error('Forge bridge did not initialise within the expected time.'));
        return;
      }

      setTimeout(check, BRIDGE_READY_POLL_MS);
    };

    check();
  });

  return readyPromise;
};

const loadModule = async () => {
  if (!modulePromise) {
    modulePromise = import('@forge/bridge');
  }
  await waitForReady();
  return modulePromise;
};

export const invokeBridge = async (functionKey, payload) => {
  const { invoke } = await loadModule();
  return invoke(functionKey, payload);
};

export const onBridgeEvent = async (eventName, handler) => {
  const { events } = await loadModule();
  return events.on(eventName, handler);
};

export const requestConfluence = async (path, options) => {
  const { requestConfluence: request } = await loadModule();
  return request(path, options);
};
