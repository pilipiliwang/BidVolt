export type ApiTestPanelEnvironment = {
  DEV: boolean;
  VITE_SHOW_API_TEST_PANEL?: string;
};

export function shouldShowApiTestPanel(
  environment: ApiTestPanelEnvironment = import.meta.env,
) {
  const override = environment.VITE_SHOW_API_TEST_PANEL?.trim().toLowerCase();

  if (override === 'true') return true;
  if (override === 'false') return false;

  return environment.DEV;
}
