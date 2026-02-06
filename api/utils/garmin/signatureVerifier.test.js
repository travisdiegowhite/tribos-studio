import crypto from 'crypto';
import { verifySignature, getSignatureFromHeaders } from './signatureVerifier.js';

describe('verifySignature', () => {
  const secret = 'test-webhook-secret';
  const body = '{"activities":[{"userId":"123"}]}';

  function computeHmac(secret, body) {
    return crypto.createHmac('sha256', secret).update(body).digest('hex');
  }

  it('accepts a valid signature', () => {
    const sig = computeHmac(secret, body);
    const result = verifySignature(secret, sig, body);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('rejects an invalid signature', () => {
    const result = verifySignature(secret, 'deadbeef', body);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid signature');
  });

  it('rejects missing signature when secret is configured', () => {
    const result = verifySignature(secret, null, body);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Missing signature');
  });

  it('rejects empty string signature', () => {
    const result = verifySignature(secret, '', body);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Missing signature');
  });

  it('skips verification when no secret configured', () => {
    const result = verifySignature(null, null, body);
    expect(result.valid).toBe(true);

    const result2 = verifySignature('', null, body);
    expect(result2.valid).toBe(true);
  });

  it('handles different body content correctly', () => {
    const body2 = '{"different":"payload"}';
    const sig = computeHmac(secret, body);
    const result = verifySignature(secret, sig, body2);
    expect(result.valid).toBe(false);
  });
});

describe('getSignatureFromHeaders', () => {
  it('returns x-garmin-signature when present', () => {
    const headers = { 'x-garmin-signature': 'abc123' };
    expect(getSignatureFromHeaders(headers)).toBe('abc123');
  });

  it('falls back to x-webhook-signature', () => {
    const headers = { 'x-webhook-signature': 'def456' };
    expect(getSignatureFromHeaders(headers)).toBe('def456');
  });

  it('prefers x-garmin-signature over x-webhook-signature', () => {
    const headers = {
      'x-garmin-signature': 'garmin-sig',
      'x-webhook-signature': 'webhook-sig'
    };
    expect(getSignatureFromHeaders(headers)).toBe('garmin-sig');
  });

  it('returns null when no signature headers present', () => {
    expect(getSignatureFromHeaders({})).toBeNull();
    expect(getSignatureFromHeaders({ 'content-type': 'application/json' })).toBeNull();
  });
});
