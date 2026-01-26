export type ZeroStatePreset = {
  id: string;
  label: string;
  prompt: string;
};

export const DEFAULT_ZERO_STATE_PRESETS: ZeroStatePreset[] = [
  { id: "uber", label: "Uber", prompt: "Uber" },
  { id: "saas-billing", label: "SaaS Billing", prompt: "SaaS Billing" },
  { id: "cicd", label: "CI/CD Pipeline", prompt: "CI/CD Pipeline" },
];
