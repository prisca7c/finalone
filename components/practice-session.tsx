'use client';

import { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { matchChord } from '@/lib/chordMatcher';

const CHORD_LIBRARY: Record<string, { frets: (number | null)[]; fingers: (number | null)[]; name: string }> = {
  C: { frets: [null, 3, 2, 0, 1, 0], fingers: [null, 3, 2, null, 1, null], name: 'C Major' },
  D: { frets: [null, null, 0, 2, 3, 2], fingers: [null, null, null, 1, 3, 2], name: 'D Major' },
  E: { frets: [0, 2, 2, 1, 0, 0], fingers: [null, 2, 3, 1, null, null], name: 'E Major' },
  G: { frets: [3, 2, 0, 0, 0, 3], fingers: [3, 2, null, null, null, 4], name: 'G Major' },
  A: { frets: [null, 0, 2, 2, 2, 0], fingers: [null, null, 1, 2, 3, null], name: 'A Major' },
  Em: { frets: [0, 2, 2, 0, 0, 0], fingers: [null, 2, 3, null, null, null], name: 'E Minor' },
  Am: { frets: [null, 0, 2, 2, 1, 0], fingers: [null, null, 2, 3, 1, null], name: 'A Minor' },
  Dm: { frets: [null, null, 0, 2, 3, 1], fingers: [null, null, null, 2, 4, 1], name: 'D Minor' },
};

const STRING_NAMES = ['E', 'B', 'G', 'D', 'A', 'E'];
const FINGER_NAMES = ['Index', 'Middle', 'Ring', 'Pinky'];
const NUM_STRINGS = 6;
const NUM_FRETS = 12;

export default function PracticeSession() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentChord, setCurrentChord] = useState('C');
  const [detectedChord, setDetectedChord] = useState<string | null>(null);
  const [fingerPositions, setFingerPositions] = useState<Array<{ finger: string; string: number; fret: number }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [accuracy, setAccuracy] = useState(0);
  const handsRef = useRef<any>(null);

  useEffect(() => {
    const loadMediaPipe = async () => {
      const scripts = [
        'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js',
        'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js',
        'https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js'
      ];

      for (const src of scripts) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = src;
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }

      const Hands = (window as any).Hands;
      const Camera = (window as any).Camera;

      handsRef.current = new Hands({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
      });

      handsRef.current.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      handsRef.current.onResults(onResults);

      if (videoRef.current) {
        const camera = new Camera(videoRef.current, {
          onFrame: async () => {
            await handsRef.current.send({ image: videoRef.current });
          },
          width: 1280,
          height: 720
        });
        camera.start();
        setIsLoading(false);
      }
    };

    loadMediaPipe();
  }, []);

  const onResults = (results: any) => {
    if (!canvasRef.current || !videoRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Fretboard coordinates - ADJUST THESE to match your guitar position
    const fretboardRegion = {
      topLeft: { x: canvas.width * 0.15, y: canvas.height * 0.3 },
      bottomRight: { x: canvas.width * 0.8, y: canvas.height * 0.6 }
    };

    drawFretboard(ctx, fretboardRegion);

    const positions: Array<{ finger: string; fingerNum: number; string: number; fret: number }> = [];

    if (results.multiHandLandmarks) {
      for (const landmarks of results.multiHandLandmarks) {
        const drawingUtils = (window as any).drawConnectors;
        const drawLandmarksFunc = (window as any).drawLandmarks;
        const HAND_CONNECTIONS = (window as any).HAND_CONNECTIONS;

        if (drawingUtils && drawLandmarksFunc && HAND_CONNECTIONS) {
          drawingUtils(ctx, landmarks, HAND_CONNECTIONS, { color: '#00ffff', lineWidth: 2 });
          drawLandmarksFunc(ctx, landmarks, { color: '#ffffff', lineWidth: 1, radius: 2 });
        }

        const fingertipIndices = [8, 12, 16, 20];
        const mcpIndices = [5, 9, 13, 17];

        fingertipIndices.forEach((tipIdx, i) => {
          const tip = landmarks[tipIdx];
          const mcp = landmarks[mcpIndices[i]];

          const tipX = tip.x * canvas.width;
          const tipY = tip.y * canvas.height;

          ctx.fillStyle = '#ff00ff';
          ctx.beginPath();
          ctx.arc(tipX, tipY, 10, 0, 2 * Math.PI);
          ctx.fill();

          if (tip.z < mcp.z - 0.02) {
            const pos = detectFingerPosition(tipX, tipY, fretboardRegion);
            if (pos) {
              positions.push({
                finger: FINGER_NAMES[i],
                fingerNum: i + 1,
                string: pos.string,
                fret: pos.fret
              });
            }
          }
        });
      }
    }

    setFingerPositions(positions);

    // Call your chord matching function
    const fingerData: Array<[number, number, number]> = positions.map(p => [p.fingerNum, p.string, p.fret]);
    const matched = matchChord(fingerData);
    setDetectedChord(matched);

    // Calculate accuracy
    if (matched === currentChord) {
      setAccuracy(100);
    } else {
      const requiredPositions = getRequiredPositions(currentChord);
      const correctCount = fingerData.filter(fd => 
        requiredPositions.some(rp => rp[0] === fd[0] && rp[1] === fd[1] && rp[2] === fd[2])
      ).length;
      setAccuracy(requiredPositions.length > 0 ? (correctCount / requiredPositions.length) * 100 : 0);
    }
  };

  const getRequiredPositions = (chord: string): Array<[number, number, number]> => {
    const chordInfo = CHORD_LIBRARY[chord];
    if (!chordInfo) return [];
    
    const positions: Array<[number, number, number]> = [];
    chordInfo.frets.forEach((fret, stringIdx) => {
      const finger = chordInfo.fingers[stringIdx];
      if (fret !== null && fret > 0 && finger !== null) {
        positions.push([finger, stringIdx + 1, fret]);
      }
    });
    return positions;
  };

  const drawFretboard = (
    ctx: CanvasRenderingContext2D,
    region: { topLeft: { x: number; y: number }; bottomRight: { x: number; y: number } }
  ) => {
    const { topLeft, bottomRight } = region;

    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 3;
    ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);

    // Draw strings
    for (let i = 0; i < NUM_STRINGS; i++) {
      const y = topLeft.y + ((bottomRight.y - topLeft.y) / NUM_STRINGS) * (i + 0.5);
      ctx.beginPath();
      ctx.moveTo(topLeft.x, y);
      ctx.lineTo(bottomRight.x, y);
      ctx.strokeStyle = '#00cc00';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#00ff00';
      ctx.font = '14px Arial';
      ctx.fillText(STRING_NAMES[i], topLeft.x - 30, y + 5);
    }

    // Draw frets
    for (let i = 1; i < NUM_FRETS; i++) {
      const x = topLeft.x + ((bottomRight.x - topLeft.x) / NUM_FRETS) * i;
      ctx.beginPath();
      ctx.moveTo(x, topLeft.y);
      ctx.lineTo(x, bottomRight.y);
      ctx.strokeStyle = '#00cc00';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#00ff00';
      ctx.font = '16px Arial';
      ctx.fillText(i.toString(), x - 8, topLeft.y - 12);
    }

    // Draw nut
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(topLeft.x, topLeft.y);
    ctx.lineTo(topLeft.x, bottomRight.y);
    ctx.stroke();
  };

  const detectFingerPosition = (
    tipX: number,
    tipY: number,
    region: { topLeft: { x: number; y: number }; bottomRight: { x: number; y: number } }
  ): { string: number; fret: number } | null => {
    const { topLeft, bottomRight } = region;

    if (tipX < topLeft.x || tipX > bottomRight.x || tipY < topLeft.y || tipY > bottomRight.y) {
      return null;
    }

    const relY = (tipY - topLeft.y) / (bottomRight.y - topLeft.y);
    const stringNum = Math.floor(relY * NUM_STRINGS) + 1;

    const relX = (tipX - topLeft.x) / (bottomRight.x - topLeft.x);
    const fretNum = Math.floor(relX * NUM_FRETS) + 1;

    return {
      string: Math.max(1, Math.min(NUM_STRINGS, stringNum)),
      fret: Math.max(1, Math.min(NUM_FRETS, fretNum))
    };
  };

  return (
    <div className="relative w-full h-screen bg-black">
      <div className="relative w-full h-full">
        <video
          ref={videoRef}
          className="absolute top-0 left-0 w-full h-full object-cover scale-x-[-1]"
          autoPlay
          playsInline
          muted
        />
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0 w-full h-full scale-x-[-1]"
        />
      </div>

      <Card className="absolute top-6 left-6 p-6 bg-black/90 border-green-500 border-2 max-w-sm">
        <h2 className="text-3xl font-bold text-green-500 mb-4">🎸 AI Guitar Tutor</h2>

        <div className="flex flex-wrap gap-2 mb-6">
          {Object.keys(CHORD_LIBRARY).map((chord) => (
            <Button
              key={chord}
              onClick={() => setCurrentChord(chord)}
              variant={currentChord === chord ? 'default' : 'outline'}
              className={`${
                currentChord === chord
                  ? 'bg-green-500 hover:bg-green-600 text-black'
                  : 'border-green-500 text-green-500 hover:bg-green-500/20'
              } font-bold`}
            >
              {chord}
            </Button>
          ))}
        </div>

        <div className="mb-4 p-4 bg-green-500/20 border-2 border-green-500 rounded-lg">
          <p className="text-lg font-semibold text-white mb-1">
            Target: {CHORD_LIBRARY[currentChord]?.name}
          </p>
          <p className={`text-2xl font-bold ${detectedChord === currentChord ? 'text-green-400' : 'text-red-400'}`}>
            Detected: {detectedChord || 'None'}
          </p>
        </div>

        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-white">Accuracy</span>
            <span className="text-sm font-bold text-white">{Math.round(accuracy)}%</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-6 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                accuracy >= 80 ? 'bg-green-500' : accuracy >= 50 ? 'bg-yellow-500' : 'bg-red-500'
              }`}
              style={{ width: `${accuracy}%` }}
            />
          </div>
        </div>

        <div className="space-y-2 max-h-40 overflow-y-auto">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Finger Positions:</p>
          {fingerPositions.length === 0 ? (
            <p className="text-sm text-gray-500 italic">No fingers detected</p>
          ) : (
            fingerPositions.map((pos, i) => (
              <div key={i} className="text-sm text-white bg-purple-600/30 border border-purple-500 p-2 rounded">
                <span className="font-semibold">{pos.finger}:</span> String {pos.string} ({STRING_NAMES[pos.string - 1]}), Fret {pos.fret}
              </div>
            ))
          )}
        </div>
      </Card>

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-green-500 mb-4 mx-auto"></div>
            <p className="text-white text-2xl font-semibold">Loading MediaPipe...</p>
          </div>
        </div>
      )}

      {accuracy === 100 && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
          <div className="text-9xl animate-bounce">✓</div>
          <p className="text-4xl font-bold text-green-500 text-center mt-4">Perfect!</p>
        </div>
      )}
    </div>
  );
}
