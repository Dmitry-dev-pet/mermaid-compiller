export const getModelVendor = (model) => {
  const id = (model.id || "").toLowerCase();
  if (id.startsWith("gpt-")) return "gpt";
  if (id.startsWith("gemini-")) return "gemini";
  if (id.startsWith("glm-")) return "glm";
  return "";
};

export const parseGptVersion = (id) => {
  if (!id) return 0;
  const match = id.match(/^gpt-(\d+(?:\.\d+)?)/i);
  if (!match) return 0;
  const value = Number.parseFloat(match[1]);
  if (Number.isNaN(value)) return 0;
  return value;
};

export const pickLatestModelId = (models) => {
  if (!models.length) return null;
  let best = models[0];
  for (const m of models) {
    if (typeof m.created === "number" && typeof best.created === "number") {
      if (m.created > best.created) {
        best = m;
      }
    } else if ((m.id || "") > (best.id || "")) {
      best = m;
    }
  }
  return best.id || null;
};

export const pickLatestGptHighModelId = (models) => {
  const gptModels = models.filter((m) => getModelVendor(m) === "gpt");
  if (!gptModels.length) return null;

  let candidates = gptModels.filter((m) => (m.id || "").toLowerCase().includes("high"));
  if (!candidates.length) {
    candidates = gptModels;
  }

  let best = candidates[0];
  let bestVersion = parseGptVersion(best.id || "");

  for (const m of candidates) {
    const version = parseGptVersion(m.id || "");
    if (version > bestVersion) {
      best = m;
      bestVersion = version;
    } else if (version === bestVersion && (m.id || "") > (best.id || "")) {
      best = m;
    }
  }

  return best.id || null;
};

export const filterModelsByVendor = (models, filter) => {
  if (filter === "all") return models;
  return models.filter((m) => getModelVendor(m) === filter);
};

export const selectBestModel = (models, filter, preferredModel) => {
  let candidates = filterModelsByVendor(models, filter);
  if (!candidates.length) candidates = models;

  if (preferredModel) {
    const match = candidates.find((m) => m.id === preferredModel);
    if (match) return match.id;
  }

  if (filter === "gpt") {
    return pickLatestGptHighModelId(models) || pickLatestModelId(models);
  } else if (filter === "gemini") {
    const geminiModels = models.filter((m) => getModelVendor(m) === "gemini");
    return pickLatestModelId(geminiModels) || pickLatestModelId(models);
  } else if (filter === "glm") {
    const glmModels = models.filter((m) => getModelVendor(m) === "glm");
    return pickLatestModelId(glmModels) || pickLatestModelId(models);
  } else {
    return pickLatestGptHighModelId(models) || pickLatestModelId(models);
  }
};
