import { Coordinate, Direction } from './types';

export const GRID_SIZE = 20; // 20x20 grid
export const INITIAL_SPEED = 150; // ms per frame
export const MIN_SPEED = 50; // Fastest speed
export const SPEED_DECREMENT = 2; // How much speed increases per food

export const POWERUP_DURATION = 5000; // ms
export const POWERUP_SPAWN_CHANCE = 0.03; // Chance per tick to spawn if empty (3%)

export const COMBO_TIMEOUT_MS = 4000; // Time to eat next food to keep combo
export const POINTS_PER_FOOD = 10; 

export const INITIAL_SNAKE: Coordinate[] = [
  { x: 10, y: 10 },
  { x: 10, y: 11 },
  { x: 10, y: 12 },
];

export const INITIAL_DIRECTION = Direction.UP;

// Key mappings
export const KEY_MAP: Record<string, Direction> = {
  ArrowUp: Direction.UP,
  ArrowDown: Direction.DOWN,
  ArrowLeft: Direction.LEFT,
  ArrowRight: Direction.RIGHT,
  w: Direction.UP,
  s: Direction.DOWN,
  a: Direction.LEFT,
  d: Direction.RIGHT,
  W: Direction.UP,
  S: Direction.DOWN,
  A: Direction.LEFT,
  D: Direction.RIGHT,
};