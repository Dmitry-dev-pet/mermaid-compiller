import { sanitizeMermaidCode } from "./sanitize.js";

const state = {
  cliproxyApiToken: "test",
  defaultCliproxyBaseUrl: "http://localhost:8317",
  cliproxyBaseUrl: "http://localhost:8317",
  cliproxyApiModel: "",
  docsSearchUrl: "/docs/search",
  diagramDocsTemplates: {
    auto: { structure: "mermaid syntax basics", style: "mermaid styling tips directives" },
    flowchart: { structure: "flowchart mermaid syntax", style: "flowchart mermaid styling directives" },
    sequence: { structure: "sequence diagram mermaid syntax", style: "sequence diagram mermaid styling directives" },
    class: { structure: "class diagram mermaid syntax", style: "class diagram mermaid styling directives" },
    state: { structure: "state diagram mermaid syntax", style: "state diagram mermaid styling directives" },
    er: { structure: "er diagram mermaid syntax", style: "er diagram mermaid theme directives" },
    gantt: { structure: "gantt mermaid syntax", style: "gantt mermaid styling directives" },
    mindmap: { structure: "mindmap mermaid syntax", style: "mindmap mermaid styling directives" },
    pie: { structure: "pie chart mermaid syntax", style: "pie chart mermaid styling directives" },
    gitgraph: { structure: "gitgraph mermaid syntax", style: "gitgraph mermaid styling directives" },
    journey: { structure: "user journey mermaid syntax", style: "user journey mermaid styling directives" },
    timeline: { structure: "timeline mermaid syntax", style: "timeline mermaid styling directives" },
    c4: { structure: "c4 diagram mermaid syntax", style: "c4 diagram mermaid styling directives" },
    kanban: { structure: "kanban mermaid syntax", style: "kanban mermaid styling directives" },
    architecture: { structure: "architecture diagram mermaid syntax", style: "architecture diagram mermaid styling directives" },
    zenuml: { structure: "zenuml mermaid syntax", style: "zenuml mermaid styling directives" },
    sankey: { structure: "sankey mermaid syntax", style: "sankey mermaid styling directives" },
    xy: { structure: "xy chart mermaid syntax", style: "xy chart mermaid styling directives" },
    block: { structure: "block diagram mermaid syntax", style: "block diagram mermaid styling directives" },
    quadrant: { structure: "quadrant chart mermaid syntax", style: "quadrant chart mermaid styling directives" },
    requirement: { structure: "requirement diagram mermaid syntax", style: "requirement diagram mermaid styling directives" },
    packet: { structure: "packet diagram mermaid syntax", style: "packet diagram mermaid styling directives" },
    radar: { structure: "radar chart mermaid syntax", style: "radar chart mermaid styling directives" },
    treemap: { structure: "treemap mermaid syntax", style: "treemap mermaid styling directives" },
  },
  iterations: [],
  activeIterationIndex: -1,
  selectedDiagramType: "auto",
  allModels: [],
  currentModelFilter: "all",
  maxStructureRetries: 5,
  maxStyleFixAttempts: 5,
};

const listeners = new Set();

export const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const notify = () => {
  listeners.forEach((listener) => listener(state));
};

export const getState = () => state;

export const updateCliproxyBaseUrl = (value) => {
  state.cliproxyBaseUrl = value || state.defaultCliproxyBaseUrl;
  notify();
};

export const setCliproxyApiModel = (modelId) => {
  state.cliproxyApiModel = modelId;
  notify();
};

export const setSelectedDiagramType = (type) => {
  state.selectedDiagramType = type || "auto";
  notify();
};

export const setAllModels = (models) => {
  state.allModels = models;
  notify();
};

export const setModelFilter = (filter) => {
  state.currentModelFilter = filter;
  notify();
};

export const addIteration = (iteration) => {
  state.iterations.push(iteration);
  notify();
  return state.iterations.length - 1;
};

export const getIterations = () => state.iterations;

export const setActiveIterationIndex = (index) => {
  state.activeIterationIndex = index;
  notify();
};

export const getActiveIteration = () =>
  state.activeIterationIndex >= 0 ? state.iterations[state.activeIterationIndex] : null;

export const createIterationEntry = (
  displayPrompt,
  promptOriginal,
  promptPrepared,
  docsMeta,
  docsContextText,
  diagramTypeOverride,
) => ({
  id: state.iterations.length + 1,
  label: `D${state.iterations.length + 1}`,
  prompt: displayPrompt,
  promptOriginal,
  promptPrepared,
  diagramType: diagramTypeOverride || state.selectedDiagramType,
  docsMeta: docsMeta,
  docsContextText,
  styleDocsMeta: null,
  styleDocsContextText: "",
  stages: [],
  activeCode: "",
  summary: "",
  originIterationId: null,
  createdAt: Date.now(),
  baseStructureCode: "",
});

export const sanitizeCode = sanitizeMermaidCode;

export const prepareUserPrompt = (rawPrompt, diagramType) => {
  const original = rawPrompt || "";
  let prepared = original.replace(/\s+/g, " ").trim();

  if (diagramType && diagramType !== "auto" && prepared) {
    prepared = `[diagramType: ${diagramType}] ${prepared}`;
  }

  return { original, prepared };
};
