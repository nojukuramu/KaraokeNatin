import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Measures how much of a song's runtime the singer actually sang into the
 * mic (coverage), and maps that coverage onto a 0-100 karaoke score.
 *
 * This intentionally does NOT measure pitch/timing accuracy — it only
 * checks whether voice-level input was present. "Sang through half the
 * song" -> ~50. "Sang essentially the whole thing" -> a randomized 90-100.
 */

/** How often (ms) to sample the mic input level while a song plays. */
const SAMPLE_INTERVAL_MS = 100;

/**
 * RMS level (0..1, computed from normalized time-domain samples in the
 * range [-1, 1]) above which a sample counts as "voiced" (someone singing
 * or talking into the mic) rather than silence/room noise. A quiet room's
 * noise floor on a consumer mic typically sits well under 0.01 RMS, while a
 * raised singing voice near the mic comfortably exceeds 0.02-0.05. This is
 * the floor used when ambient calibration (below) yields a lower value.
 */
const DEFAULT_VOICE_RMS_THRESHOLD = 0.02;

/** How long (ms) to sample ambient noise before finalizing the voice gate. */
const CALIBRATION_DURATION_MS = 600;

/** Ambient noise floor is multiplied by this to get the calibrated gate. */
const CALIBRATION_MULTIPLIER = 2.5;

/**
 * Coverage fraction (0..1) at/above which we consider the singer to have
 * sung "essentially the whole song". Maps into the randomized 90-100 band.
 */
export const FULL_COVERAGE_THRESHOLD = 0.9;

/**
 * Floor for the mapped score below full coverage, so a near-silent attempt
 * still reads as a low, clearly-not-broken number rather than 0.
 */
const MIN_SCORE = 5;

/**
 * Maps measured mic coverage (fraction of the song with voice-level input
 * present, 0..1) to a display score, 0-100.
 *
 * - coverage >= FULL_COVERAGE_THRESHOLD -> randomized 90-100.
 * - otherwise -> Math.round(coverage * 100), clamped to [MIN_SCORE, 100).
 *
 * Pure and Web-Audio-free so it can be unit tested directly.
 */
export const coverageToScore = (coverage: number): number => {
    const safeCoverage = Number.isFinite(coverage) ? coverage : 0;
    const clamped = Math.min(1, Math.max(0, safeCoverage));

    if (clamped >= FULL_COVERAGE_THRESHOLD) {
        return Math.floor(Math.random() * 11) + 90; // 90-100 inclusive
    }

    return Math.max(MIN_SCORE, Math.round(clamped * 100));
};

/** Minimal typed escape hatch for Safari/older WebKit's prefixed AudioContext. */
type WindowWithWebkitAudioContext = Window &
    typeof globalThis & {
        webkitAudioContext?: typeof AudioContext;
    };

const getAudioContextCtor = (): typeof AudioContext | undefined => {
    if (typeof window === 'undefined') return undefined;
    const win = window as WindowWithWebkitAudioContext;
    return win.AudioContext || win.webkitAudioContext;
};

const micApisAvailable = (): boolean => {
    return (
        typeof navigator !== 'undefined' &&
        !!navigator.mediaDevices &&
        typeof navigator.mediaDevices.getUserMedia === 'function' &&
        !!getAudioContextCtor()
    );
};

export interface UseMicCoverageResult {
    /** Whether the mic + Web Audio APIs exist in this environment at all. */
    isAvailable: boolean;
    /** Last error encountered (permission denied, no device, etc.), if any. */
    error: string | null;
    /**
     * Begin sampling mic input for the current song. Resolves `true` if
     * capture actually started, `false` if the mic is unavailable, denied,
     * or otherwise failed (in which case `error` is set). Never throws —
     * callers should treat `false` as "no score for this song".
     */
    start: () => Promise<boolean>;
    /**
     * Stop sampling, tear down all audio resources (stream tracks, audio
     * context, interval), and return the coverage fraction (0..1) measured
     * since `start()`. Safe to call even if `start()` was never called or
     * failed (returns 0).
     */
    stop: () => Promise<number>;
}

export const useMicCoverage = (): UseMicCoverageResult => {
    const [error, setError] = useState<string | null>(null);
    const [isAvailable] = useState(() => micApisAvailable());

    const streamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const totalSamplesRef = useRef(0);
    const voicedSamplesRef = useRef(0);
    const calibrationSamplesRef = useRef<number[]>([]);
    const gateThresholdRef = useRef(DEFAULT_VOICE_RMS_THRESHOLD);
    const startTimeRef = useRef(0);

    // Tears down everything: mic tracks, audio graph, and the sample timer.
    // Safe to call multiple times / when nothing was ever started.
    const cleanup = useCallback(() => {
        if (intervalRef.current !== null) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
        if (audioContextRef.current) {
            const ctx = audioContextRef.current;
            audioContextRef.current = null;
            if (ctx.state !== 'closed') {
                ctx.close().catch(() => {
                    // Nothing useful to do if closing fails; the context is
                    // being discarded either way.
                });
            }
        }
        analyserRef.current = null;
        dataArrayRef.current = null;
    }, []);

    // Belt-and-suspenders: if a caller starts capture and unmounts without
    // calling stop() (e.g. navigating away mid-song), don't leak the mic.
    useEffect(() => cleanup, [cleanup]);

    const start = useCallback(async (): Promise<boolean> => {
        setError(null);
        totalSamplesRef.current = 0;
        voicedSamplesRef.current = 0;
        calibrationSamplesRef.current = [];
        gateThresholdRef.current = DEFAULT_VOICE_RMS_THRESHOLD;
        startTimeRef.current = Date.now();

        if (!isAvailable) {
            setError('Microphone is not available in this environment');
            return false;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            const AudioContextCtor = getAudioContextCtor();
            if (!AudioContextCtor) {
                throw new Error('AudioContext is not available');
            }
            const audioContext = new AudioContextCtor();
            audioContextRef.current = audioContext;

            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048;
            source.connect(analyser);
            analyserRef.current = analyser;

            dataArrayRef.current = new Uint8Array(analyser.fftSize);

            intervalRef.current = setInterval(() => {
                const currentAnalyser = analyserRef.current;
                const currentData = dataArrayRef.current;
                if (!currentAnalyser || !currentData) return;

                currentAnalyser.getByteTimeDomainData(currentData);

                // RMS of the normalized (-1..1) waveform for this sample.
                let sumSquares = 0;
                for (let i = 0; i < currentData.length; i++) {
                    const normalized = (currentData[i] - 128) / 128;
                    sumSquares += normalized * normalized;
                }
                const rms = Math.sqrt(sumSquares / currentData.length);

                // Calibrate the gate against ambient noise for the first
                // moment of capture, then hold it steady for the rest of
                // the song.
                const elapsed = Date.now() - startTimeRef.current;
                if (elapsed < CALIBRATION_DURATION_MS) {
                    calibrationSamplesRef.current.push(rms);
                    const baseline =
                        calibrationSamplesRef.current.reduce((sum, v) => sum + v, 0) /
                        calibrationSamplesRef.current.length;
                    gateThresholdRef.current = Math.max(
                        DEFAULT_VOICE_RMS_THRESHOLD,
                        baseline * CALIBRATION_MULTIPLIER
                    );
                }

                totalSamplesRef.current += 1;
                if (rms >= gateThresholdRef.current) {
                    voicedSamplesRef.current += 1;
                }
            }, SAMPLE_INTERVAL_MS);

            return true;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Microphone access failed';
            setError(message);
            cleanup();
            return false;
        }
    }, [isAvailable, cleanup]);

    const stop = useCallback(async (): Promise<number> => {
        const total = totalSamplesRef.current;
        const voiced = voicedSamplesRef.current;
        cleanup();
        if (total === 0) return 0;
        return voiced / total;
    }, [cleanup]);

    return { isAvailable, error, start, stop };
};
