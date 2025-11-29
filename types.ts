export enum Direction {
  UP = 'UP',
  DOWN = 'DOWN',
  LEFT = 'LEFT',
  RIGHT = 'RIGHT',
}

export enum GameStatus {
  IDLE = 'IDLE',
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED',
  GAME_OVER = 'GAME_OVER',
}

export enum PowerUpType {
  GHOST = 'GHOST',      // Invincibility + Wall Wrap
  SLOW_TIME = 'SLOW_TIME' // Slows game down
}

export interface Coordinate {
  x: number;
  y: number;
}

export type SnakeBody = Coordinate[];

export interface PowerUp extends Coordinate {
  type: PowerUpType;
}

export interface ActivePowerUp {
  type: PowerUpType;
  expiresAt: number; // Timestamp
}

export interface GameState {
  snake: SnakeBody;
  food: Coordinate;
  powerUps: PowerUp[];
  direction: Direction;
  score: number;
  highScore: number;
  status: GameStatus;
  speed: number;
  gameOverReason: 'WALL' | 'SELF' | null;
}

export interface AiComment {
  text: string;
  mood: 'ROAST' | 'PRAISE' | 'NEUTRAL';
}