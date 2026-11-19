// The one place API code constructs an Anthropic client. Use
// `createClaudeClient({ apiKey, endpoint: 'my-endpoint' })` instead of
// `new Anthropic(...)`; `claudeModels.test.js` fails CI on a bare
// `new Anthropic(` anywhere else under api/.
//
// The client it returns reports to Sentry (via serverSentry.js, tag
// `claude.*`) whenever a Messages API call fails in a way that means OUR code
// or config is wrong rather than the service being busy:
//
//   claude.model_not_found  404: the model ID is retired or never existed
//   claude.bad_request      400: a parameter the model rejects (e.g.
//                           `temperature` on Sonnet 5.5) or a malformed body
//   claude.auth             401/403: key revoked, wrong workspace
//   claude.refusal          200 with stop_reason "refusal": the model (and
//                           any fallback) declined to answer
//
// Rate limits (429), overloads (529) and 5xx are transient and the SDK
// retries them, so they are not reported here.
//
// This lives at the HTTP layer, not in each endpoint's catch block, because
// many endpoints catch the error and fall back to a default (persona →
// pragmatist, a generic welcome, no fuel summary). That is fine for the user,
// but it is how a retired model went unnoticed for five months: nothing
// failed loudly. Reporting here sees every failure even when the endpoint
// swallows it.

import Anthropic from '@anthropic-ai/sdk';
import { captureServerError } from './serverSentry.js';

const TAG_BY_STATUS = {
  400: 'claude.bad_request',
  401: 'claude.auth',
  403: 'claude.auth',
  404: 'claude.model_not_found',
};

/**
 * @param {object} [options] - Anthropic client options, plus:
 * @param {string} options.endpoint - Short label for the calling endpoint
 *   (e.g. 'fuel-plan'); it lands in Sentry so alerts say which feature broke.
 * @returns {Anthropic}
 */
export function createClaudeClient({ endpoint = 'unknown', ...options } = {}) {
  return new Anthropic({ ...options, fetch: monitoredFetch(endpoint, options.fetch) });
}

/**
 * Wrap a fetch implementation so Messages API failures are reported.
 * Exported for tests. Never throws on its own account: a reporting failure
 * must not break the request.
 */
export function monitoredFetch(endpoint, baseFetch) {
  return async (url, init) => {
    const doFetch = baseFetch ?? globalThis.fetch;
    const response = await doFetch(url, init);
    try {
      await inspect(endpoint, String(url), init, response);
    } catch {
      // Reporting is best-effort.
    }
    return response;
  };
}

async function inspect(endpoint, url, init, response) {
  if (!url.includes('/v1/messages')) return;

  const tag = TAG_BY_STATUS[response.status];
  if (tag) {
    const body = await response.clone().text();
    const apiError = parseJson(body)?.error;
    captureServerError(
      `Claude API ${response.status} ${apiError?.type ?? ''}: ${apiError?.message ?? body.slice(0, 300)}`.trim(),
      {
        tag,
        extra: {
          endpoint,
          model: requestedModel(init),
          status: response.status,
          error_type: apiError?.type ?? null,
          request_id: response.headers?.get?.('request-id') ?? null,
        },
      },
    );
    return;
  }

  // Refusals arrive as HTTP 200. Only non-streaming JSON bodies are checked;
  // a streamed reply would have to be read to the end to see its stop reason.
  const contentType = response.headers?.get?.('content-type') ?? '';
  if (response.ok && contentType.includes('application/json')) {
    const message = parseJson(await response.clone().text());
    if (message?.stop_reason === 'refusal') {
      captureServerError(`Claude refusal on ${endpoint}`, {
        tag: 'claude.refusal',
        extra: {
          endpoint,
          model: message.model ?? requestedModel(init),
          category: message.stop_details?.category ?? null,
          request_id: response.headers?.get?.('request-id') ?? null,
        },
      });
    }
  }
}

function requestedModel(init) {
  return typeof init?.body === 'string' ? parseJson(init.body)?.model ?? null : null;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
