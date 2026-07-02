import { useEffect, useRef, useState } from 'react';
import styles from './RestTimer.module.css';

const PRESETS = [
  { label: '60s', seconds: 60 },
  { label: '90s', seconds: 90 },
  { label: '2m', seconds: 120 },
];

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function playBeep() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.4);
    oscillator.onended = () => ctx.close();
  } catch {
    // ignore audio errors (e.g. unsupported browser)
  }
}

export default function RestTimer() {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!running) return undefined;
    intervalRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(intervalRef.current);
          setRunning(false);
          try {
            navigator.vibrate?.([200, 100, 200]);
          } catch {
            // ignore vibration errors
          }
          playBeep();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [running]);

  function start(seconds) {
    clearInterval(intervalRef.current);
    setSecondsLeft(seconds);
    setRunning(true);
  }

  function stop() {
    clearInterval(intervalRef.current);
    setRunning(false);
    setSecondsLeft(0);
  }

  return (
    <div className={styles.bar}>
      {running ? (
        <>
          <span className={styles.countdown}>{formatTime(secondsLeft)}</span>
          <button type="button" className={styles.stopButton} onClick={stop}>
            Stop
          </button>
        </>
      ) : (
        <>
          <span className={styles.label}>Rest timer</span>
          <div className={styles.presets}>
            {PRESETS.map((p) => (
              <button
                type="button"
                key={p.seconds}
                className={styles.presetButton}
                onClick={() => start(p.seconds)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
