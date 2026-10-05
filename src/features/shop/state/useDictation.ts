/**
 * Browser speech-to-text (Web Speech API: Chrome, Edge, Safari incl. iOS).
 * Not available in Firefox; callers fall back to typing.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

interface RecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type RecognitionCtor = new () => Recognition;

function getCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function useDictation(onFinal: (text: string) => void) {
  const supported = !!getCtor();
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const finalText = useRef('');
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  const stop = useCallback(() => rec.current?.stop(), []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor || rec.current) return;
    const r = new Ctor();
    r.lang = navigator.language || 'en-US';
    r.continuous = false;
    r.interimResults = true;
    finalText.current = '';
    setInterim('');
    setError(null);
    r.onresult = (e) => {
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText.current += `${res[0].transcript} `;
        else live += res[0].transcript;
      }
      setInterim((finalText.current + live).trim());
    };
    r.onerror = (e) => {
      if (e.error !== 'aborted' && e.error !== 'no-speech') {
        setError(e.error === 'not-allowed' ? 'Microphone access was blocked.' : `Dictation error: ${e.error}`);
      }
    };
    r.onend = () => {
      rec.current = null;
      setListening(false);
      const text = finalText.current.trim();
      if (text) onFinalRef.current(text);
    };
    rec.current = r;
    setListening(true);
    r.start();
  }, []);

  useEffect(() => () => rec.current?.abort(), []);

  return { supported, listening, interim, error, start, stop };
}
