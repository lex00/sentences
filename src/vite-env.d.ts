/// <reference types="vite/client" />
/// <reference types="@webgpu/types" />

interface ImportMetaEnv {
  // URL of the 72 MB benepar weights on the deployed site (a GitHub Release asset); unset in dev.
  readonly VITE_MODEL_URL?: string;
}
