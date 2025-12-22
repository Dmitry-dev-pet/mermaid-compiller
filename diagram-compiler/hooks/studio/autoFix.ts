type ValidationState = {
  isValid?: boolean;
  errorMessage?: string;
};

type AutoFixArgs<TValidation extends ValidationState> = {
  initialCode: string;
  initialValidation: TValidation;
  maxAttempts: number;
  validate: (code: string) => Promise<TValidation>;
  fix: (code: string, errorMessage: string) => Promise<string>;
  onIteration?: (code: string, validation: TValidation) => void;
};

export const runAutoFixLoop = async <TValidation extends ValidationState>(
  args: AutoFixArgs<TValidation>
) => {
  let currentCode = args.initialCode;
  let validation = args.initialValidation;
  let attempts = 0;

  args.onIteration?.(currentCode, validation);

  while (!validation.isValid && attempts < args.maxAttempts) {
    attempts += 1;
    const errorMessage = validation.errorMessage || 'Unknown error';
    const fixedCode = await args.fix(currentCode, errorMessage);
    if (!fixedCode.trim()) break;

    currentCode = fixedCode;
    validation = await args.validate(currentCode);
    args.onIteration?.(currentCode, validation);

    if (validation.isValid) break;
  }

  return { code: currentCode, validation, attempts };
};
