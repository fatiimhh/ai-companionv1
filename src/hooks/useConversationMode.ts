import { useEffect, useRef, useState } from "react";

export type ConversationPhase = "off" | "waiting" | "hearing";
export type EndReason = "timeout" | "noise" | "mic-error";

type Options = {
  active: boolean; // is the conversation mode active?
  paused: boolean; // is the conversation mode paused? (e.g. cuz Doo is talking)
  onUtterance: (blob: Blob) => Promise<boolean>;// returns true if the utterance produced text false if it was empty
  onEnd: (reason: EndReason) => void;
};

// Tuning knobs
const TICK_MS = 50; // how often the volume is checked
const MIN_THRESHOLD = 0.015; // quietest volume that can count as speech
const NOISE_MULTIPLIER = 3; // speech must be this much louder than background noise
const MIN_SPEECH_MS = 250; // how long you must be loud before it counts as speech
const SILENCE_MS = 1200; // silence after speech that means "I'm done talking"
const MAX_TURN_MS = 30000; // longest single message
const FIRST_TIMEOUT_MS = 12000; // give up if you say nothing after starting
const FOLLOWUP_TIMEOUT_MS = 10000; // give up if you say nothing after a reply
const RESUME_DELAY_MS = 600; // wait after Doo stops talking so its own voice tail isn't heard
const MAX_EMPTY_TURNS = 2; // end after this many turns in a row that produce no text

export function useConversationMode({ active, paused, onUtterance, onEnd }: Options) {
  const [phase, setPhase] = useState<ConversationPhase>("off");
  const [ready, setReady] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const hadConversationRef = useRef(false);
  const emptyTurnsRef = useRef(0);
  const noiseRef = useRef(0.008);

  // calls the latest versions of the callbacks
  const onUtteranceRef = useRef(onUtterance);
  const onEndRef = useRef(onEnd);
  useEffect(() => {
    onUtteranceRef.current = onUtterance;
    onEndRef.current = onEnd;
  });

  // start and stop the microphone stream
  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    hadConversationRef.current = false;
    emptyTurnsRef.current = 0;
    noiseRef.current = 0.008;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const ctx = new AudioContext();
        await ctx.resume();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(analyser);

        streamRef.current = stream;
        audioCtxRef.current = ctx;
        analyserRef.current = analyser;
        setReady(true);
      } catch (err) {
        console.warn("Could not start conversation mode:", err);
        if (!cancelled) onEndRef.current("mic-error");
      }
    })();

    return () => {
      cancelled = true;
      setReady(false);
      setPhase("off");
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      void audioCtxRef.current?.close();
      audioCtxRef.current = null;
      analyserRef.current = null;
    };
  }, [active]);

  // start and stop recording when the user speaks
  useEffect(() => {
    if (!active || !ready || paused) return;

    const stream = streamRef.current;
    const analyser = analyserRef.current;
    if (!stream || !analyser) return;

    let stopped = false;
    let recorder: MediaRecorder | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;

    const startDelay = setTimeout(
      () => {
        if (stopped) return;

        const chunks: Blob[] = [];
        recorder = new MediaRecorder(stream);
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        recorder.start();
        setPhase("waiting");

        const samples = new Float32Array(analyser.fftSize);
        const startedAt = performance.now();
        let lastTick = startedAt;
        let lastLoudAt = startedAt;
        let speechMs = 0;
        let heardSpeech = false;
        const noSpeechTimeout = hadConversationRef.current
          ? FOLLOWUP_TIMEOUT_MS
          : FIRST_TIMEOUT_MS;

        const finish = (send: boolean) => {
          if (timer) clearInterval(timer);
          timer = null;
          const rec = recorder;
          if (!rec || rec.state === "inactive") return;

          rec.onstop = () => {
            if (!send) return;
            const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
            setPhase("off");
            void onUtteranceRef.current(blob).then((ok) => {
              if (ok) {
                hadConversationRef.current = true;
                emptyTurnsRef.current = 0;
              } else {
                emptyTurnsRef.current += 1;
                if (emptyTurnsRef.current >= MAX_EMPTY_TURNS) onEndRef.current("noise");
              }
            });
          };
          rec.stop();
        };

        timer = setInterval(() => {
          const now = performance.now();
          const dt = now - lastTick;
          lastTick = now;

          // compute the current volume level
          analyser.getFloatTimeDomainData(samples);
          let sum = 0;
          for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
          const level = Math.sqrt(sum / samples.length);

          // update the noise estimate and check if we're loud enough to count as speech
          const threshold = Math.max(MIN_THRESHOLD, noiseRef.current * NOISE_MULTIPLIER);
          const loud = level > threshold;
          if (!loud) noiseRef.current = noiseRef.current * 0.95 + level * 0.05;

          if (loud) {
            lastLoudAt = now;
            speechMs += dt;
            if (!heardSpeech && speechMs >= MIN_SPEECH_MS) {
              heardSpeech = true;
              setPhase("hearing");
            }
          } else if (!heardSpeech && now - lastLoudAt > 400) {
            speechMs = 0; // a click or cough not speech
          }

          if (heardSpeech && (now - lastLoudAt > SILENCE_MS || now - startedAt > MAX_TURN_MS)) {
            finish(true);
          } else if (!heardSpeech && now - startedAt > noSpeechTimeout) {
            finish(false);
            onEndRef.current("timeout");
          }
        }, TICK_MS);
      },
      hadConversationRef.current ? RESUME_DELAY_MS : 150
    );

    return () => {
      stopped = true;
      clearTimeout(startDelay);
      if (timer) clearInterval(timer);
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        recorder.stop();
      }
      setPhase("off");
    };
  }, [active, ready, paused]);

  return { phase };
}