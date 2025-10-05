// Convert your match_chord.py to TypeScript

interface ChordData {
  [key: string]: Array<[number, number, number]>; // [finger, string, fret]
}

// Your GuitarChords.csv data converted to TypeScript
// This replaces the pandas dataframe from match_chord.py
const CHORDS: ChordData = {
  "C": [[3, 1, 3], [2, 2, 2], [1, 4, 1]],
  "D": [[1, 3, 2], [3, 4, 3], [2, 5, 2]],
  "E": [[2, 2, 2], [3, 3, 2], [1, 4, 1]],
  "G": [[3, 1, 3], [2, 2, 2], [4, 6, 3]],
  "A": [[1, 3, 2], [2, 4, 2], [3, 5, 2]],
  "Em": [[2, 2, 2], [3, 3, 2]],
  "Am": [[2, 3, 2], [3, 4, 2], [1, 5, 1]],
  "Dm": [[2, 3, 2], [4, 4, 3], [1, 5, 1]],
  // Add more chords from your CSV here
};

export function matchChord(
  fingerPositions: Array<[number, number, number]>
): string | null {
  // This is the exact logic from your match_chord.py
  for (const [chordName, positions] of Object.entries(CHORDS)) {
    const allMatch = positions.every(pos => 
      fingerPositions.some(fp => 
        fp[0] === pos[0] && fp[1] === pos[1] && fp[2] === pos[2]
      )
    );
    
    if (allMatch) {
      return chordName;
    }
  }
  
  return null;
}
