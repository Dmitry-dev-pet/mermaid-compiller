import { AUTO_FIX_MAX_ATTEMPTS, LLM_TIMEOUT_RETRIES, NOTEBOOK_DIAGRAM_MAX_ATTEMPTS } from '../../constants';

export const NOTEBOOK_BUILD_RETRY_CONFIG = {
  diagramAttempts: NOTEBOOK_DIAGRAM_MAX_ATTEMPTS,
  autoFixAttempts: AUTO_FIX_MAX_ATTEMPTS,
  plannerTimeoutRetries: LLM_TIMEOUT_RETRIES,
  buildRequestRetries: 1,
  fixRequestRetries: 1,
};
