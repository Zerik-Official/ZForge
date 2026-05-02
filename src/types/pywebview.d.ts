declare global {
  interface Window {
    pywebview: {
      api: {
        launchGame(): Promise<void>;
        installClient(): Promise<void>;
        repairClient(): Promise<void>;
      };
    };
  }
}

export {};