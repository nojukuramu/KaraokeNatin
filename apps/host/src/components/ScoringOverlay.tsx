import { useEffect, useState } from 'react';

interface ScoringOverlayProps {
    score: number;
    onComplete: () => void;
    songTitle?: string;
}

const ScoringOverlay = ({ score, onComplete, songTitle }: ScoringOverlayProps) => {
    const [phase, setPhase] = useState<'intro' | 'score' | 'exit'>('intro');
    const isPerfect = score === 101;

    useEffect(() => {
        // Phase timing
        const timers: number[] = [];

        // Intro phase (0.5s)
        timers.push(setTimeout(() => setPhase('score'), 500));

        // Exit phase (after 3s total)
        timers.push(setTimeout(() => setPhase('exit'), 3000));

        // Complete (after exit animation)
        timers.push(setTimeout(() => onComplete(), 3500));

        return () => timers.forEach(clearTimeout);
    }, [onComplete]);

    return (
        <div className={`scoring-overlay ${phase}`}>
            <div className="scoring-content">
                {phase === 'intro' && (
                    <div className="scoring-intro">
                        <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 18V5l12-2v13" />
                            <circle cx="6" cy="18" r="3" />
                            <circle cx="18" cy="16" r="3" />
                        </svg>
                    </div>
                )}

                {phase === 'score' && (
                    <>
                        <div className={`score-display ${isPerfect ? 'perfect-score' : ''}`}>
                            {score}
                        </div>
                        <div className="score-label">
                            {isPerfect ? '⭐ PERFECT! ⭐' : 'Great performance!'}
                        </div>
                        {songTitle && (
                            <div className="score-song-title">{songTitle}</div>
                        )}
                    </>
                )}

                {phase === 'exit' && (
                    <div className="scoring-exit">
                        <span>Next song...</span>
                    </div>
                )}
            </div>

            <style>{`
        .scoring-overlay {
          position: fixed;
          inset: 0;
          background: linear-gradient(135deg, #15202b, #22303c);
          z-index: 1001;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: opacity 0.5s;
        }

        .scoring-overlay.exit {
          opacity: 0;
        }

        .scoring-content {
          text-align: center;
        }

        .scoring-intro {
          color: #1da1f2;
          animation: pulse 0.5s ease-out;
        }

        @keyframes pulse {
          0% { transform: scale(0); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }

        .score-display {
          font-size: 200px;
          font-weight: 800;
          color: #1da1f2;
          text-shadow: 0 0 80px rgba(29, 161, 242, 0.6);
          animation: scoreReveal 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }

        @keyframes scoreReveal {
          0% { transform: scale(0) rotate(-15deg); opacity: 0; }
          70% { transform: scale(1.15) rotate(5deg); }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }

        .perfect-score {
          color: #ffad1f;
          text-shadow: 0 0 80px rgba(255, 173, 31, 0.6);
          animation: perfectScore 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }

        @keyframes perfectScore {
          0% { transform: scale(0) rotate(-15deg); opacity: 0; }
          50% { transform: scale(1.3) rotate(5deg); }
          70% { transform: scale(0.9); }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }

        .score-label {
          font-size: 28px;
          color: #8899a6;
          margin-top: 24px;
          animation: slideUp 0.5s ease-out 0.3s both;
        }

        .score-song-title {
          font-size: 18px;
          color: #657786;
          margin-top: 16px;
          animation: slideUp 0.5s ease-out 0.5s both;
        }

        @keyframes slideUp {
          from { transform: translateY(30px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        .scoring-exit {
          font-size: 24px;
          color: #8899a6;
          animation: fadeIn 0.3s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
        </div>
    );
};

export default ScoringOverlay;
