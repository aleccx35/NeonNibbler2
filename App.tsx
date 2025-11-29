
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameBoard } from './components/GameBoard';
import { Controls } from './components/Controls';
import { Overlay } from './components/Overlay';
import { GRID_SIZE, INITIAL_SNAKE, INITIAL_DIRECTION, INITIAL_SPEED, MIN_SPEED, SPEED_DECREMENT, KEY_MAP, POWERUP_DURATION, POWERUP_SPAWN_CHANCE, COMBO_TIMEOUT_MS, POINTS_PER_FOOD } from './constants';
import { Direction, GameStatus, Coordinate, AiComment, PowerUp, PowerUpType, ActivePowerUp } from './types';
import { generateGameOverMessage } from './services/geminiService';
import { audioService } from './services/audioService';
import { Volume2, VolumeX, Zap, Gauge, Ghost, Hourglass, Heart, Flame, Trophy, Pause } from 'lucide-react';

const MAX_LIVES = 3;
const SWIPE_THRESHOLD = 10; // Minimum distance for a swipe (Lowered for higher sensitivity)

function App() {
  // --- State ---
  const [snake, setSnake] = useState<Coordinate[]>(INITIAL_SNAKE);
  const [food, setFood] = useState<Coordinate>({ x: 5, y: 5 });
  const [powerUps, setPowerUps] = useState<PowerUp[]>([]);
  const [activePowerUp, setActivePowerUp] = useState<ActivePowerUp | null>(null);
  
  const [direction, setDirection] = useState<Direction>(INITIAL_DIRECTION);
  const [nextDirection, setNextDirection] = useState<Direction>(INITIAL_DIRECTION); 
  
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [isHighScoreAnimating, setIsHighScoreAnimating] = useState(false);
  const [lives, setLives] = useState(MAX_LIVES);
  const [status, setStatus] = useState<GameStatus>(GameStatus.IDLE);
  const [startSpeed, setStartSpeed] = useState(INITIAL_SPEED); 
  const [gameOverReason, setGameOverReason] = useState<'WALL' | 'SELF' | null>(null);
  const [aiComment, setAiComment] = useState<AiComment | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Combo State
  const [combo, setCombo] = useState(0);
  const [comboExpiresAt, setComboExpiresAt] = useState(0);
  
  // Refs
  const gameLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const savedComboTimeRef = useRef<number>(0);
  const touchStartRef = useRef<{ x: number, y: number } | null>(null);

  // --- Derived State ---
  const multiplier = 1 + Math.floor(combo / 5);

  // Speed is derived from snake length (difficulty) and active powerups.
  const calculateSpeed = () => {
    // Speed increases based on length (items eaten), not score (which is inflated by multipliers)
    const itemsEaten = Math.max(0, snake.length - INITIAL_SNAKE.length);
    const baseDifficultySpeed = Math.max(MIN_SPEED, startSpeed - (itemsEaten * SPEED_DECREMENT));
    
    if (activePowerUp?.type === PowerUpType.SLOW_TIME) {
       // Slow down (increase interval)
       return baseDifficultySpeed * 2.5;
    }
    return baseDifficultySpeed;
  };
  
  const currentSpeed = calculateSpeed();

  // --- Helpers ---
  
  const isOccupied = useCallback((x: number, y: number, currentSnake: Coordinate[], currentPowerUps: PowerUp[]) => {
      const onSnake = currentSnake.some(s => s.x === x && s.y === y);
      const onPowerUp = currentPowerUps.some(p => p.x === x && p.y === y);
      return onSnake || onPowerUp;
  }, []);

  const generateFood = useCallback((currentSnake: Coordinate[], currentPowerUps: PowerUp[]): Coordinate => {
    let newFood: Coordinate;
    do {
      newFood = {
        x: Math.floor(Math.random() * GRID_SIZE),
        y: Math.floor(Math.random() * GRID_SIZE),
      };
    } while (isOccupied(newFood.x, newFood.y, currentSnake, currentPowerUps));
    return newFood;
  }, [isOccupied]);

  const generatePowerUp = useCallback((currentSnake: Coordinate[], currentFood: Coordinate, currentPowerUps: PowerUp[]): PowerUp | null => {
    // Only max 1 power up at a time
    if (currentPowerUps.length > 0) return null;

    let newLoc: Coordinate;
    let attempts = 0;
    do {
      newLoc = {
        x: Math.floor(Math.random() * GRID_SIZE),
        y: Math.floor(Math.random() * GRID_SIZE),
      };
      attempts++;
    } while (
      (isOccupied(newLoc.x, newLoc.y, currentSnake, currentPowerUps) || (newLoc.x === currentFood.x && newLoc.y === currentFood.y)) 
      && attempts < 20
    );

    if (attempts >= 20) return null;

    const type = Math.random() > 0.5 ? PowerUpType.GHOST : PowerUpType.SLOW_TIME;
    return { ...newLoc, type };
  }, [isOccupied]);

  const handleGameOver = useCallback(async (currentScore: number, reason: 'WALL' | 'SELF') => {
    if (gameLoopRef.current) clearInterval(gameLoopRef.current);
    
    // Switch to Game Over music
    audioService.startGameOverBGM();
    
    setStatus(GameStatus.GAME_OVER);
    setGameOverReason(reason);
    
    // High score logic moved to real-time update, but ensuring it saves here too
    if (currentScore > highScore) {
      localStorage.setItem('neonSnakeHighScore', currentScore.toString());
    }

    setLoadingAi(true);
    const comment = await generateGameOverMessage(currentScore, reason);
    setAiComment(comment);
    setLoadingAi(false);
  }, [highScore]);

  const handleLifeLost = useCallback((reason: 'WALL' | 'SELF') => {
      if (lives > 1) {
          audioService.playDamage();
          setLives(l => l - 1);
          setCombo(0); // Reset combo on death
          
          // Reset positions but keep game running
          setSnake(INITIAL_SNAKE);
          setDirection(INITIAL_DIRECTION);
          setNextDirection(INITIAL_DIRECTION);
          setActivePowerUp(null);
          
          // Ensure food isn't under the new snake
          setFood(prevFood => {
              const isUnderSpawn = INITIAL_SNAKE.some(s => s.x === prevFood.x && s.y === prevFood.y);
              if (isUnderSpawn) return generateFood(INITIAL_SNAKE, []);
              return prevFood;
          });
      } else {
          setLives(0);
          handleGameOver(score, reason);
      }
  }, [lives, score, handleGameOver, generateFood]);

  const resetGame = () => {
    audioService.init();
    // Switch to Gameplay music
    audioService.startBGM();
    
    setSnake(INITIAL_SNAKE);
    setDirection(INITIAL_DIRECTION);
    setNextDirection(INITIAL_DIRECTION);
    setScore(0);
    setLives(MAX_LIVES);
    setPowerUps([]);
    setActivePowerUp(null);
    setCombo(0);
    setComboExpiresAt(0);
    setStatus(GameStatus.PLAYING);
    setGameOverReason(null);
    setAiComment(null);
    setFood(generateFood(INITIAL_SNAKE, []));
    setIsHighScoreAnimating(false);
  };
  
  const handleExit = () => {
    audioService.stopBGM();
    if (gameLoopRef.current) clearInterval(gameLoopRef.current);
    setStatus(GameStatus.IDLE);
    setScore(0);
    setLives(MAX_LIVES);
    setPowerUps([]);
    setActivePowerUp(null);
    setCombo(0);
  };

  const toggleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    audioService.setMuted(newMuted);
  };

  const handlePause = () => {
    audioService.playPauseSFX();
    audioService.pauseBGM();
    
    // Save remaining combo time
    if (combo > 0) {
      savedComboTimeRef.current = Math.max(0, comboExpiresAt - Date.now());
    } else {
      savedComboTimeRef.current = 0;
    }
    
    setStatus(GameStatus.PAUSED);
  };

  const handleResume = () => {
    audioService.playPauseSFX();
    audioService.resumeBGM();
    
    // Restore combo time
    if (savedComboTimeRef.current > 0) {
      setComboExpiresAt(Date.now() + savedComboTimeRef.current);
    }
    
    setStatus(GameStatus.PLAYING);
  };

  // --- Game Tick ---

  const moveSnake = useCallback(() => {
    if (status !== GameStatus.PLAYING) return;

    const now = Date.now();

    // Check powerup expiration
    if (activePowerUp && now > activePowerUp.expiresAt) {
        setActivePowerUp(null);
    }

    // Check combo expiration
    if (combo > 0 && now > comboExpiresAt) {
        setCombo(0);
    }

    setSnake(prevSnake => {
      const head = prevSnake[0];
      const newHead = { ...head };

      // Update actual direction from buffer
      setDirection(nextDirection);
      const currentDir = nextDirection;

      switch (currentDir) {
        case Direction.UP: newHead.y -= 1; break;
        case Direction.DOWN: newHead.y += 1; break;
        case Direction.LEFT: newHead.x -= 1; break;
        case Direction.RIGHT: newHead.x += 1; break;
      }

      // 1. Collision Check: Wall
      if (
        newHead.x < 0 || 
        newHead.x >= GRID_SIZE || 
        newHead.y < 0 || 
        newHead.y >= GRID_SIZE
      ) {
        if (activePowerUp?.type === PowerUpType.GHOST) {
            // Wrap around logic
            if (newHead.x < 0) newHead.x = GRID_SIZE - 1;
            if (newHead.x >= GRID_SIZE) newHead.x = 0;
            if (newHead.y < 0) newHead.y = GRID_SIZE - 1;
            if (newHead.y >= GRID_SIZE) newHead.y = 0;
        } else {
            handleLifeLost('WALL');
            return prevSnake;
        }
      }

      // 2. Collision Check: Self
      if (activePowerUp?.type !== PowerUpType.GHOST && prevSnake.some(seg => seg.x === newHead.x && seg.y === newHead.y)) {
        handleLifeLost('SELF');
        return prevSnake;
      }

      const newSnake = [newHead, ...prevSnake];

      // 3. Collision Check: Food
      if (newHead.x === food.x && newHead.y === food.y) {
        audioService.playEat();
        
        // Update Combo & Score
        setCombo(c => {
           const newCombo = c + 1;
           return newCombo;
        });
        
        const effectiveCombo = combo + 1;
        const currentMultiplier = 1 + Math.floor(effectiveCombo / 5);
        
        setScore(s => s + (POINTS_PER_FOOD * currentMultiplier));
        setComboExpiresAt(Date.now() + COMBO_TIMEOUT_MS);
        
        setFood(generateFood(newSnake, powerUps));
        // Don't pop tail, so it grows
      } else {
        newSnake.pop(); // Remove tail
      }

      // 4. Collision Check: PowerUps
      const hitPowerUpIndex = powerUps.findIndex(p => p.x === newHead.x && p.y === newHead.y);
      if (hitPowerUpIndex !== -1) {
          const powerUp = powerUps[hitPowerUpIndex];
          audioService.playPowerUp();
          setActivePowerUp({
              type: powerUp.type,
              expiresAt: Date.now() + POWERUP_DURATION
          });
          
          const newPowerUps = [...powerUps];
          newPowerUps.splice(hitPowerUpIndex, 1);
          setPowerUps(newPowerUps);
      }

      return newSnake;
    });

    // Randomly spawn powerups
    if (Math.random() < POWERUP_SPAWN_CHANCE) {
        setPowerUps(prev => {
            if (prev.length >= 1) return prev; // Max 1 on screen
            const newItem = generatePowerUp(snake, food, prev);
            return newItem ? [...prev, newItem] : prev;
        });
    }

  }, [status, nextDirection, food, powerUps, activePowerUp, combo, comboExpiresAt, snake, handleLifeLost, generateFood, generatePowerUp]);

  // --- Effects ---

  useEffect(() => {
    const saved = localStorage.getItem('neonSnakeHighScore');
    if (saved) setHighScore(parseInt(saved, 10));
  }, []);

  // Update High Score Real-time
  useEffect(() => {
    if (score > highScore) {
      setHighScore(score);
      localStorage.setItem('neonSnakeHighScore', score.toString());
      setIsHighScoreAnimating(true);
      const timer = setTimeout(() => setIsHighScoreAnimating(false), 300);
      return () => clearTimeout(timer);
    }
  }, [score, highScore]);

  useEffect(() => {
    if (status === GameStatus.PLAYING) {
      gameLoopRef.current = setInterval(moveSnake, currentSpeed);
    } else {
      if (gameLoopRef.current) clearInterval(gameLoopRef.current);
    }
    return () => {
      if (gameLoopRef.current) clearInterval(gameLoopRef.current);
    };
  }, [status, moveSnake, currentSpeed]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (KEY_MAP[e.key]) {
        e.preventDefault();
        updateDirection(KEY_MAP[e.key]);
      } else if (e.code === 'Space') {
        e.preventDefault();
        if (status === GameStatus.PLAYING) {
          handlePause();
        } else if (status === GameStatus.PAUSED) {
          handleResume();
        } else if (status === GameStatus.IDLE || status === GameStatus.GAME_OVER) {
          resetGame();
        }
      } else if (e.code === 'Escape') {
        if (status === GameStatus.PLAYING) {
           handlePause();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [status, startSpeed, combo, comboExpiresAt]);

  // --- Handlers ---

  const updateDirection = (newDir: Direction) => {
    setDirection(currentDir => {
      const isOpposite = 
        (newDir === Direction.UP && currentDir === Direction.DOWN) ||
        (newDir === Direction.DOWN && currentDir === Direction.UP) ||
        (newDir === Direction.LEFT && currentDir === Direction.RIGHT) ||
        (newDir === Direction.RIGHT && currentDir === Direction.LEFT);
      
      if (!isOpposite) {
        setNextDirection(newDir);
        return currentDir;
      }
      return currentDir;
    });
  };

  const handleManualDirection = (newDir: Direction) => {
    updateDirection(newDir);
  };

  // --- Touch / Swipe Handlers ---

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY
    };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    // We do NOT call preventDefault here, as passive listener warnings might occur.
    // CSS 'touch-action: none' handles the scrolling prevention.
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;

    // Safety: Don't trigger movement if the user tapped a button or input
    // @ts-ignore
    if (e.target.closest && (e.target.closest('button') || e.target.closest('input'))) {
      touchStartRef.current = null;
      return;
    }

    const touchEnd = {
      x: e.changedTouches[0].clientX,
      y: e.changedTouches[0].clientY
    };

    const diffX = touchEnd.x - touchStartRef.current.x;
    const diffY = touchEnd.y - touchStartRef.current.y;
    const absDiffX = Math.abs(diffX);
    const absDiffY = Math.abs(diffY);

    // 1. Swipe Detection (Longer Drag)
    if (Math.max(absDiffX, absDiffY) > SWIPE_THRESHOLD) {
      if (absDiffX > absDiffY) {
        if (diffX > 0) updateDirection(Direction.RIGHT);
        else updateDirection(Direction.LEFT);
      } else {
        if (diffY > 0) updateDirection(Direction.DOWN);
        else updateDirection(Direction.UP);
      }
    } 
    // 2. Tap Quadrant Detection (Fallback if not a swipe)
    else {
       // Divide screen into 4 quadrants (X shape)
       // Calculate tap position relative to screen center
       const { innerWidth, innerHeight } = window;
       const centerX = innerWidth / 2;
       const centerY = innerHeight / 2;
       
       const tapX = touchEnd.x - centerX;
       const tapY = touchEnd.y - centerY;
       
       // Compare relative x/y to determine quadrant
       if (Math.abs(tapX) > Math.abs(tapY)) {
           // Horizontal Dominant
           if (tapX > 0) updateDirection(Direction.RIGHT);
           else updateDirection(Direction.LEFT);
       } else {
           // Vertical Dominant
           if (tapY > 0) updateDirection(Direction.DOWN);
           else updateDirection(Direction.UP);
       }
    }

    touchStartRef.current = null;
  };

  const getDifficultyLabel = (ms: number) => {
    if (ms <= 80) return "INSANE";
    if (ms <= 120) return "HARD";
    if (ms <= 180) return "NORMAL";
    return "CHILL";
  };
  
  const getDifficultyColor = (ms: number) => {
    if (ms <= 80) return "text-fuchsia-500 animate-pulse";
    if (ms <= 120) return "text-red-400";
    if (ms <= 180) return "text-cyan-400";
    return "text-green-400";
  };

  const getTimeLeftPercent = () => {
      if (!activePowerUp) return 0;
      const left = Math.max(0, activePowerUp.expiresAt - Date.now());
      return (left / POWERUP_DURATION) * 100;
  };

  const getComboProgress = () => {
    if (combo === 0 || status !== GameStatus.PLAYING) return 0;
    const timeLeft = Math.max(0, comboExpiresAt - Date.now());
    return (timeLeft / COMBO_TIMEOUT_MS) * 100;
  };
  
  return (
    <div 
      className="h-[100dvh] bg-black text-gray-200 flex flex-col items-center p-4 relative overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      
      {/* Background Decor */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-gray-800 via-black to-black"></div>
      <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r shadow-[0_0_20px_rgba(6,182,212,0.8)] transition-all duration-500 
          ${activePowerUp?.type === PowerUpType.GHOST ? 'from-yellow-400 via-white to-yellow-400' : 
            activePowerUp?.type === PowerUpType.SLOW_TIME ? 'from-emerald-400 via-white to-emerald-400' : 
            'from-transparent via-cyan-500 to-transparent'}`} 
      />

      {/* Header - Fixed Height */}
      <div className="z-10 w-full max-w-[500px] flex justify-between items-end mb-2 px-2 shrink-0">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white pixel-font tracking-tighter drop-shadow-lg">
            NEON<span className="text-cyan-400">NIBBLER</span>
          </h1>
          <div className="flex items-center gap-2 mt-1">
             <div className="flex text-red-500 drop-shadow-[0_0_5px_rgba(239,68,68,0.8)]">
                {[...Array(MAX_LIVES)].map((_, i) => (
                    <Heart 
                        key={i} 
                        size={16} 
                        fill={i < lives ? "currentColor" : "none"} 
                        className={`transition-all duration-300 ${i < lives ? 'scale-100' : 'scale-75 opacity-20'}`}
                    />
                ))}
             </div>
             <p className="text-xs text-gray-500 font-mono">LIVES</p>
          </div>
        </div>
        
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2">
             {status === GameStatus.PLAYING && (
                 <button 
                    onClick={handlePause}
                    className="p-2 text-gray-400 hover:text-cyan-400 transition-colors bg-gray-900/50 rounded-full border border-gray-800"
                    title="Pause"
                 >
                    <Pause size={16} />
                 </button>
             )}
             <button 
                onClick={toggleMute}
                className="p-2 text-gray-400 hover:text-cyan-400 transition-colors bg-gray-900/50 rounded-full border border-gray-800"
                title={isMuted ? "Unmute" : "Mute"}
             >
                {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
             </button>
          </div>
          
          <div className="flex items-end gap-4">
             {/* BEST SCORE */}
             <div className="text-right hidden sm:block">
                <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Best</div>
                <div className={`text-xl font-mono font-bold leading-none transition-colors duration-300 flex items-center justify-end gap-1
                    ${isHighScoreAnimating ? 'text-yellow-400 animate-pop' : 'text-gray-400'}
                `}>
                  {highScore > 0 && highScore === score ? <Trophy size={14} className="text-yellow-500"/> : null}
                  {highScore.toString()}
                </div>
             </div>

             {/* CURRENT SCORE */}
             <div className="text-right">
                <div className="text-xs text-gray-400 uppercase tracking-widest mb-1">Score</div>
                <div className="text-4xl font-mono font-bold text-cyan-400 leading-none drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]">
                  {score.toString().padStart(3, '0')}
                </div>
             </div>
          </div>
        </div>
      </div>

      {/* HUD - Combo Bar - Fixed Height */}
      <div className="z-10 w-full max-w-[500px] mb-2 h-8 relative flex items-center justify-between px-2 shrink-0">
         {/* Combo Display */}
         <div className={`flex items-center gap-2 transition-opacity duration-300 ${combo > 0 ? 'opacity-100' : 'opacity-0'}`}>
             <div className="relative">
                 <div className="text-2xl font-black italic text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-500 to-cyan-500 pixel-font tracking-tighter"
                      style={{ transform: `scale(${1 + Math.min(0.5, combo * 0.05)})` }}
                 >
                    {combo}x
                 </div>
                 <div className="absolute -bottom-1 left-0 w-full h-1 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-fuchsia-500 to-cyan-500"
                         style={{ width: '100%', animation: status === GameStatus.PLAYING ? `shrink ${COMBO_TIMEOUT_MS}ms linear forwards` : 'none', animationFillMode: 'forwards' }}
                         key={combo} // Reset animation on combo change
                    />
                 </div>
                 <style>{`
                    @keyframes shrink { from { width: 100%; } to { width: 0%; } }
                 `}</style>
             </div>
             <div className="flex flex-col">
                 <span className="text-[10px] font-bold text-fuchsia-400 leading-none uppercase tracking-widest">Combo</span>
                 {multiplier > 1 && (
                     <span className="text-xs font-bold text-cyan-300 leading-none animate-pulse">
                        +{Math.floor((multiplier-1)*100)}% PTS
                     </span>
                 )}
             </div>
         </div>

         {/* Multiplier Badge */}
         {multiplier > 1 && (
             <div className="flex items-center gap-1 px-3 py-1 bg-gray-900 border border-fuchsia-500/50 rounded-full shadow-[0_0_10px_rgba(217,70,239,0.3)] animate-bounce">
                <Flame size={12} className="text-fuchsia-500" />
                <span className="text-xs font-bold text-white tracking-widest">
                    MULTIPLIER <span className="text-fuchsia-400 text-sm">x{multiplier}</span>
                </span>
             </div>
         )}
      </div>

      {/* Main Game Container - Responsive Height */}
      <div className="relative z-10 w-full max-w-[500px] flex-1 min-h-0 flex items-center justify-center">
        <div className="w-full aspect-square max-h-full">
          <Overlay 
            status={status}
            score={score}
            highScore={highScore}
            aiComment={aiComment}
            loadingAi={loadingAi}
            onRestart={resetGame}
            onResume={handleResume}
            onExit={handleExit}
          />
          
          {status === GameStatus.IDLE && (
             <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center z-20 rounded-lg border border-cyan-900/50">
               <Zap size={48} className="text-cyan-400 mb-6 animate-pulse" />
               
               {/* Difficulty Slider */}
               <div className="w-full max-w-xs mb-8 px-6">
                  <div className="flex justify-between text-cyan-300 text-xs mb-3 font-mono uppercase tracking-wider">
                    <span className="flex items-center gap-2"><Gauge size={14}/> Difficulty</span>
                    <span className={`font-bold ${getDifficultyColor(startSpeed)}`}>{getDifficultyLabel(startSpeed)}</span>
                  </div>
                  <div className="relative w-full h-2 bg-gray-800 rounded-lg">
                    <input
                      type="range"
                      min="50"
                      max="250"
                      step="10"
                      value={300 - startSpeed} 
                      onChange={(e) => setStartSpeed(300 - parseInt(e.target.value))}
                      className="absolute w-full h-full opacity-0 z-10 cursor-pointer"
                      aria-label="Game Speed"
                    />
                    <div 
                      className="absolute h-full bg-gradient-to-r from-green-500 via-cyan-500 to-fuchsia-500 rounded-lg transition-all duration-300"
                      style={{ width: `${((300 - startSpeed - 50) / 200) * 100}%` }}
                    />
                    <div 
                      className="absolute h-4 w-4 bg-white rounded-full shadow-lg top-1/2 -translate-y-1/2 transition-all duration-75 pointer-events-none"
                       style={{ left: `calc(${((300 - startSpeed - 50) / 200) * 100}% - 8px)` }}
                    />
                  </div>
                  <div className="flex justify-between text-gray-500 text-[10px] mt-2 font-mono uppercase">
                    <span>Slow</span>
                    <span>Hyper</span>
                  </div>
               </div>

               <button 
                  onClick={resetGame}
                  className="px-8 py-3 bg-cyan-600 text-white font-bold rounded hover:bg-cyan-500 transition-colors shadow-[0_0_20px_rgba(8,145,178,0.5)] active:scale-95"
               >
                 START GAME
               </button>
               <p className="mt-6 text-xs text-gray-500 flex flex-col items-center gap-1 font-mono">
                  <span>SWIPE, TAP or ARROWS to Move</span>
                  <span>SPACE to Pause</span>
               </p>
             </div>
          )}

          {/* Active Powerup Indicator */}
          {activePowerUp && status === GameStatus.PLAYING && (
              <div className="absolute top-2 right-2 z-20 flex flex-col items-end gap-1 animate-slideLeft">
                  <div className={`flex items-center gap-2 text-xs font-bold uppercase px-2 py-1 rounded shadow-lg
                      ${activePowerUp.type === PowerUpType.GHOST ? 'bg-yellow-500 text-black' : 'bg-emerald-500 text-black'}
                  `}>
                      {activePowerUp.type === PowerUpType.GHOST ? <Ghost size={14}/> : <Hourglass size={14} />}
                      {activePowerUp.type === PowerUpType.GHOST ? 'GHOST MODE' : 'TIME WARP'}
                  </div>
                  <div className="w-full bg-gray-800 h-1 rounded overflow-hidden">
                      <div 
                          className={`h-full ${activePowerUp.type === PowerUpType.GHOST ? 'bg-yellow-500' : 'bg-emerald-500'}`} 
                          style={{ width: `${getTimeLeftPercent()}%`, transition: 'width 0.1s linear' }}
                      />
                  </div>
              </div>
          )}

          <GameBoard snake={snake} food={food} powerUps={powerUps} activePowerUp={activePowerUp} />
        </div>
      </div>

      {/* Mobile Controls - Visible only on small screens, minimal height */}
      <div className="z-10 shrink-0">
        <Controls onDirectionChange={handleManualDirection} />
      </div>

      {/* Status Bar */}
      <div className="z-10 mt-2 w-full max-w-[500px] flex justify-between items-center text-xs text-gray-600 font-mono border-t border-gray-900 pt-2 shrink-0 pb-4 sm:pb-0">
        <div>SPEED: {Math.round((300 - currentSpeed)/2.5)}%</div>
        <div className="flex gap-4">
           {status === GameStatus.PLAYING ? (
             <span className="text-green-500 animate-pulse">● LIVE</span>
           ) : (
             <span>● READY</span>
           )}
        </div>
      </div>

    </div>
  );
}

export default App;
