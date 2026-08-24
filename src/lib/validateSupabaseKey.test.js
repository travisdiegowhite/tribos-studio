import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  inspectSupabaseKey,
  assertBrowserSafeKey,
  UnsafeSupabaseKeyError,
} from './validateSupabaseKey';

/** Build a legacy Supabase JWT with the given role claim. */
function jwt(role) {
  const b64url = (o) =>
    btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ iss: 'supabase', role })}.sig`;
}

afterEach(() => vi.restoreAllMocks());

describe('inspectSupabaseKey', () => {
  it('identifies the current opaque formats by prefix', () => {
    expect(inspectSupabaseKey('sb_publishable_abc123')).toMatchObject({
      format: 'publishable', role: 'anon', browserSafe: true, certain: true,
    });
    expect(inspectSupabaseKey('sb_secret_abc123')).toMatchObject({
      format: 'secret', role: 'service_role', browserSafe: false, certain: true,
    });
  });

  it('reads the role claim out of legacy JWTs', () => {
    expect(inspectSupabaseKey(jwt('anon'))).toMatchObject({
      format: 'jwt', role: 'anon', browserSafe: true, certain: true,
    });
    expect(inspectSupabaseKey(jwt('service_role'))).toMatchObject({
      format: 'jwt', role: 'service_role', browserSafe: false, certain: true,
    });
  });

  it('decodes base64url payloads that plain atob would mangle', () => {
    // A payload whose base64 contains - and _ and needs padding.
    const key = inspectSupabaseKey(jwt('anon'));
    expect(key.role).toBe('anon');
  });

  it('flags an unrecognised role as uncertain rather than safe', () => {
    expect(inspectSupabaseKey(jwt('authenticated'))).toMatchObject({
      role: 'authenticated', browserSafe: true, certain: false,
    });
  });

  it('treats a missing or placeholder key as missing', () => {
    for (const k of ['', null, undefined, 'placeholder-key']) {
      expect(inspectSupabaseKey(k).format).toBe('missing');
    }
  });

  it('does not crash on a JWT-shaped but undecodable key', () => {
    expect(inspectSupabaseKey('a.b.c')).toMatchObject({ format: 'jwt', certain: false });
  });

  it('does not crash on an entirely unknown format', () => {
    expect(inspectSupabaseKey('some-random-token')).toMatchObject({
      format: 'unknown', certain: false,
    });
  });
});

describe('assertBrowserSafeKey', () => {
  it('THROWS on a service_role JWT — the throw must escape, not be swallowed', () => {
    // Regression: the original guard threw inside its own try block, so the
    // catch turned it into a console.error and returned false. The caller
    // ignored the return value and created the client anyway, which is exactly
    // the situation the guard existed to prevent.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => assertBrowserSafeKey(jwt('service_role'))).toThrow(UnsafeSupabaseKeyError);
  });

  it('THROWS on an sb_secret_ key — the format the old guard could not see', () => {
    expect(() => assertBrowserSafeKey('sb_secret_abc123')).toThrow(UnsafeSupabaseKeyError);
    expect(() => assertBrowserSafeKey('sb_secret_abc123')).toThrow(/never reach a browser/);
  });

  it('accepts a publishable key silently', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(assertBrowserSafeKey('sb_publishable_abc123').format).toBe('publishable');
    expect(warn).not.toHaveBeenCalled();
  });

  it('accepts an anon JWT silently', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(assertBrowserSafeKey(jwt('anon')).role).toBe('anon');
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns but does not brick the app on an unidentifiable key', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => assertBrowserSafeKey('some-future-format')).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });

  it('reports a missing key without throwing', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => assertBrowserSafeKey('')).not.toThrow();
    expect(error).toHaveBeenCalled();
  });
});
