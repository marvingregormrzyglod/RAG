// static/hello-world/src/components/StageProgress.jsx
// Slim stepper that visualises which stage of the consumer workflow is active.

import React from 'react';

const STAGE_ORDER = [
  { id: 'intake', label: 'Intake' },
  { id: 'workbench', label: 'Validate & Plan' },
  { id: 'finalize', label: 'Final Response' },
];

export default function StageProgress({ currentStage }) {
  const activeIndex = Math.max(
    0,
    STAGE_ORDER.findIndex((stage) => stage.id === currentStage)
  );

  const totalSegments = STAGE_ORDER.length - 1 || 1;
  const progressPercentage = (activeIndex / totalSegments) * 100;

  return (
    <div style={wrapperStyle}>
      <div style={barBackgroundStyle}>
        <div
          style={{
            ...progressStyle,
            width: `${progressPercentage}%`,
          }}
        />
      </div>
      <div style={stageMarkersStyle}>
        {STAGE_ORDER.map((stage, index) => {
          const isComplete = index < activeIndex;
          const isActive = index === activeIndex;
          return (
            <div key={stage.id} style={markerStyle}>
              <div
                style={{
                  ...bulletStyle,
                  backgroundColor: isComplete || isActive ? '#0052CC' : '#B3BAC5',
                  transform: isActive ? 'scale(1.05)' : 'scale(1)',
                }}
              />
              <span
                style={{
                  ...labelStyle,
                  color: isComplete || isActive ? '#172B4D' : '#6B778C',
                  fontWeight: isActive ? 700 : 500,
                }}
              >
                {index + 1}. {stage.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const wrapperStyle = {
  marginBottom: '20px',
};

const barBackgroundStyle = {
  height: '6px',
  backgroundColor: '#DFE1E6',
  borderRadius: '999px',
  overflow: 'hidden',
};

const progressStyle = {
  height: '100%',
  background: 'linear-gradient(90deg, #0052CC 0%, #2684FF 100%)',
  borderRadius: '999px',
  transition: 'width 0.3s ease',
};

const stageMarkersStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  marginTop: '8px',
  fontSize: '12px',
};

const markerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
};

const bulletStyle = {
  width: '12px',
  height: '12px',
  borderRadius: '50%',
  transition: 'transform 0.2s ease, background-color 0.2s ease',
};

const labelStyle = {
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

