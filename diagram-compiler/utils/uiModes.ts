export type UiMode = 'chat' | 'build' | 'analyze' | 'fix' | 'plan' | 'system';

export const MODE_UI: Record<UiMode, { bubble: string; button?: string; buttonInactive?: string }> = {
  chat: {
    bubble:
      'bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200/70 dark:border-indigo-800/70 text-indigo-900 dark:text-indigo-100',
    button: 'bg-indigo-600 text-white hover:bg-indigo-700 border border-indigo-600',
    buttonInactive:
      'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-200 border-indigo-200 dark:border-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/40',
  },
  build: {
    bubble:
      'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-800/70 text-emerald-900 dark:text-emerald-100',
    button: 'bg-emerald-600 text-white hover:bg-emerald-700 border border-emerald-600',
    buttonInactive:
      'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-200 border-emerald-200 dark:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/40',
  },
  analyze: {
    bubble:
      'bg-sky-50 dark:bg-sky-950/40 border border-sky-200/70 dark:border-sky-800/70 text-sky-900 dark:text-sky-100',
    button: 'bg-sky-600 text-white hover:bg-sky-700 border border-sky-600',
    buttonInactive:
      'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-200 border-sky-200 dark:border-sky-700 hover:bg-sky-50 dark:hover:bg-sky-900/40',
  },
  fix: {
    bubble:
      'bg-amber-50 dark:bg-amber-950/35 border border-amber-200/70 dark:border-amber-800/70 text-amber-900 dark:text-amber-100',
    button: 'bg-amber-600 text-white hover:bg-amber-700 border border-amber-600',
    buttonInactive:
      'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-200 border-amber-200 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/40',
  },
  plan: {
    bubble:
      'bg-violet-50 dark:bg-violet-950/35 border border-violet-200/70 dark:border-violet-800/70 text-violet-900 dark:text-violet-100',
    button: 'bg-violet-600 text-white hover:bg-violet-700 border border-violet-600',
    buttonInactive:
      'bg-white dark:bg-slate-900 text-violet-600 dark:text-violet-200 border-violet-200 dark:border-violet-700 hover:bg-violet-50 dark:hover:bg-violet-900/40',
  },
  system: {
    bubble: 'bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200',
  },
};

export const MODE_BUTTON_DISABLED =
  'border border-slate-300/60 dark:border-slate-500/60 bg-slate-100/70 dark:bg-slate-800/70 text-slate-500 dark:text-slate-300';
