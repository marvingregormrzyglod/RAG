// static/hello-world/src/components/CaseLoadingOverlay.jsx
// Shared loading overlay that keeps agents visually informed while the pipeline runs background jobs.
// The overlay replicates the Step 1 experience everywhere so agents get consistent feedback when
// the AI is crunching, regardless of which stage triggered the work.

import React, { useEffect, useMemo, useState } from 'react';

export const SHARED_FLAVOR_WORDS = [
  'Crunching',
  'Determining',
  'Mustering',
  'Crafting',
  'Envisioning',
  'Incubating',
  'Vibing',
  'Moseying',
  'Wandering',
  'Sussing',
  'Hatching',
  'Ideating',
  'Shimmying',
  'Spinning',
  'Concocting',
  'Wrangling',
  'Deliberating',
  'Brewing',
  'Manifesting',
  'Accomplishing',
  'Praying',
  'Frolicking',
  'Enchanting',
  'Actioning',
  'Scheming',
  'Generating',
  'Transmuting',
  'Processing',
  'Synthesizing',
  'Percolating',
  'Stewing',
  'Wrangling',
  'Noodling',
  'Creating',
  'Philosophising',
  'Perusing',
  'Schlepping',
  'Pondering',
  'Spelunking',
  'Contemplating',
  'Unravelling',
  'Discombobulating',
  'Marinating',
  'Tinkering',
  'Musing',
  'Wandering',
  'Concocting',
  'Honking',
  'Computing',
  'Planning',
  'Dreaming',
  'Simmering',
  'Ideating',
  'Considering',
  'Baking',
  'Hatching',
  'Elucidating',
  'Stewing',
  'Puzzling',
  'Cooking',
  'Boiling',
  'Tinkering',
  'Thinking',
  'Reading',
  'Pondering',
  'Working',
  'Deciphering',
  'Mulling',
  'Appreciating',
  'Whirring',
  'Perceiving',
  'Wizarding',
  'Unfurling',
  'Sprouting',
  'Actualizing',
  'Flabbergasting',
  'Meandering',
  'Forming',
  'Calculating',
  'Channelling',
  'Coalescing',
  'Smooshing',
];

const DEFAULT_TIMER_SECONDS = 90;
const GUIDED_MESSAGE_DURATION_MS = 4000;
const FLAVOR_MESSAGE_DURATION_MS = 3500;
const DOT_TICKER_INTERVAL_MS = 360;
const COUNTDOWN_INTERVAL_MS = 120;
const FALLBACK_LOADING_MESSAGE = 'Preparing assistant context';

const getInitialMessage = (guidedMessages = [], flavorWords = []) => {
  if (guidedMessages.length) {
    return guidedMessages[0];
  }
  if (flavorWords.length) {
    return flavorWords[0];
  }
  return FALLBACK_LOADING_MESSAGE;
};

export default function CaseLoadingOverlay({
  active,
  guidedMessages = [],
  flavorWords = SHARED_FLAVOR_WORDS,
  timerDurationSeconds = DEFAULT_TIMER_SECONDS,
}) {
  const [remainingSeconds, setRemainingSeconds] = useState(timerDurationSeconds);
  const [circleProgress, setCircleProgress] = useState(0);
  const [dotCount, setDotCount] = useState(1);
  const [phase, setPhase] = useState(guidedMessages.length ? 'guided' : 'flavor');
  const [guidedMessageIndex, setGuidedMessageIndex] = useState(0);
  const [flavorWordIndex, setFlavorWordIndex] = useState(0);
  const [currentMessage, setCurrentMessage] = useState(() =>
    getInitialMessage(guidedMessages, flavorWords)
  );

  useEffect(() => {
    if (!active) {
      setRemainingSeconds(timerDurationSeconds);
      setCircleProgress(0);
      setDotCount(1);
      setPhase(guidedMessages.length ? 'guided' : 'flavor');
      setGuidedMessageIndex(0);
      setFlavorWordIndex(0);
      setCurrentMessage(getInitialMessage(guidedMessages, flavorWords));
      return;
    }

    const durationMs = timerDurationSeconds * 1000;
    const startTime = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      setCircleProgress(progress);
      const secondsLeft = Math.max(0, Math.ceil((durationMs - elapsed) / 1000));
      setRemainingSeconds(secondsLeft);
    };

    tick();
    const intervalId = setInterval(tick, COUNTDOWN_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [active, guidedMessages, flavorWords, timerDurationSeconds]);

  useEffect(() => {
    if (!active) {
      return;
    }

    const isGuidedPhase = phase === 'guided' && guidedMessages.length > 0;
    const delay = isGuidedPhase ? GUIDED_MESSAGE_DURATION_MS : FLAVOR_MESSAGE_DURATION_MS;

    const timeoutId = setTimeout(() => {
      setCurrentMessage(() => {
        if (isGuidedPhase) {
          if (guidedMessageIndex < guidedMessages.length - 1) {
            const nextIndex = guidedMessageIndex + 1;
            setGuidedMessageIndex(nextIndex);
            return guidedMessages[nextIndex];
          }
          setPhase('flavor');
          setFlavorWordIndex(0);
          return flavorWords[0] || FALLBACK_LOADING_MESSAGE;
        }

        if (!flavorWords.length) {
          return FALLBACK_LOADING_MESSAGE;
        }

        const nextIndex = (flavorWordIndex + 1) % flavorWords.length;
        setFlavorWordIndex(nextIndex);
        return flavorWords[nextIndex];
      });
    }, delay);

    return () => clearTimeout(timeoutId);
  }, [active, phase, guidedMessageIndex, guidedMessages, flavorWordIndex, flavorWords]);

  useEffect(() => {
    if (!active) {
      setDotCount(1);
      return;
    }
    const dotInterval = setInterval(() => {
      setDotCount((prev) => (prev % 3) + 1);
    }, DOT_TICKER_INTERVAL_MS);
    return () => clearInterval(dotInterval);
  }, [active]);

  const dotIndicator = useMemo(() => '.'.repeat(dotCount), [dotCount]);
  const circleDegrees = Math.min(360, circleProgress * 360);
  const countdownStyle = {
    ...countdownCircleStyle,
    background: `conic-gradient(#0052CC ${circleDegrees}deg, #E5E8F0 ${circleDegrees}deg)`,
  };

  return (
    <div style={overlayContainerStyle}>
      <div style={countdownWrapperStyle}>
        <div style={countdownStyle}>
          <div style={countdownValueStyle}>{remainingSeconds}s</div>
        </div>
      </div>
      <div style={flavorTickerStyle}>
        <span style={flavorWordStyle}>{currentMessage}</span>
        <span style={dotTickerStyle} aria-hidden="true">
          {dotIndicator}
        </span>
      </div>
    </div>
  );
}

const overlayContainerStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '16px',
  padding: '24px 0 8px',
  textAlign: 'center',
};

const countdownWrapperStyle = {
  width: '180px',
  height: '180px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const countdownCircleStyle = {
  width: '100%',
  height: '100%',
  borderRadius: '50%',
  background: 'conic-gradient(#0052CC 0deg, #E5E8F0 0deg)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  position: 'relative',
  transition: 'background 0.2s linear',
};

const countdownValueStyle = {
  width: '140px',
  height: '140px',
  borderRadius: '50%',
  backgroundColor: '#FFFFFF',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '36px',
  fontWeight: 700,
  color: '#0052CC',
  boxShadow: '0 8px 20px rgba(9, 30, 66, 0.1)',
};

const flavorTickerStyle = {
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  fontSize: '18px',
  color: '#172B4D',
  paddingRight: '24px',
  minHeight: '32px',
};

const flavorWordStyle = {
  fontWeight: 700,
};

const dotTickerStyle = {
  position: 'absolute',
  left: '100%',
  marginLeft: '4px',
  top: '50%',
  transform: 'translateY(-50%)',
  fontFamily: 'monospace',
  letterSpacing: '0.3em',
  minWidth: '40px',
  textAlign: 'left',
};

