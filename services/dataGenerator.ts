// Fix: Removed invalid file header which was causing parsing errors.
import type { DataWithRange, DataSet } from '../types';

const TIME_STEPS = 8761;
const HEIGHT = 64;
const WIDTH = 76;

// A helper to run a task in the next event loop cycle to keep UI responsive
const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));

export const generateMockData = async (): Promise<DataWithRange> => {
  return new Promise(async (resolve) => {
    const dataset: DataSet = [];
    let min = Infinity;
    let max = -Infinity;

    for (let t = 0; t < TIME_STEPS; t++) {
      const slice = new Array(HEIGHT).fill(0).map(() => new Array(WIDTH).fill(0));
      const timeFactor1 = Math.sin((t / TIME_STEPS) * 2 * Math.PI); // Yearly cycle
      const timeFactor2 = Math.cos((t / (24 * 30)) * 2 * Math.PI); // Monthly cycle

      for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
          // Create some spatial patterns
          const pattern1 = Math.sin(x / (WIDTH / 10) + timeFactor1 * 5) * Math.cos(y / (HEIGHT / 10));
          const pattern2 = Math.cos((x + y) / 15 + timeFactor2 * 3);
          
          // A radial pattern from the center
          const dx = x - WIDTH / 2;
          const dy = y - HEIGHT / 2;
          const dist = Math.sqrt(dx*dx + dy*dy) / (Math.max(WIDTH, HEIGHT) / 2);
          const pattern3 = Math.cos(dist * 10 - timeFactor1 * 5);

          const value = (pattern1 + pattern2 + pattern3) / 3;
          
          slice[y][x] = value;
          if (value < min) min = value;
          if (value > max) max = value;
        }
      }
      dataset.push(slice);
      
      // Every 100 steps, yield to main thread to prevent UI freezing
      if (t % 100 === 0) {
        await yieldToMain();
      }
    }
    
    resolve({ dataset, min, max });
  });
};