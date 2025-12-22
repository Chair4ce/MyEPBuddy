import confetti from "canvas-confetti";

// Disable web worker to avoid CSP issues
const confettiConfig = {
  useWorker: false,
  disableForReducedMotion: true,
};

// Standard celebration for new entry
export function celebrateEntry() {
  // First burst - center explosion
  confetti({
    ...confettiConfig,
    particleCount: 100,
    spread: 70,
    origin: { y: 0.6 },
    colors: ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"],
  });

  // Delayed side bursts for extra drama
  setTimeout(() => {
    confetti({
      ...confettiConfig,
      particleCount: 50,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.65 },
      colors: ["#3b82f6", "#10b981", "#f59e0b"],
    });
  }, 150);

  setTimeout(() => {
    confetti({
      ...confettiConfig,
      particleCount: 50,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.65 },
      colors: ["#ef4444", "#8b5cf6", "#ec4899"],
    });
  }, 300);
}

// Epic celebration for milestone achievements
export function celebrateMilestone() {
  const duration = 3000;
  const animationEnd = Date.now() + duration;
  const defaults = { ...confettiConfig, startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };

  function randomInRange(min: number, max: number) {
    return Math.random() * (max - min) + min;
  }

  const interval = setInterval(() => {
    const timeLeft = animationEnd - Date.now();

    if (timeLeft <= 0) {
      return clearInterval(interval);
    }

    const particleCount = 50 * (timeLeft / duration);
    
    // Emit from both sides
    confetti({
      ...defaults,
      particleCount,
      origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
      colors: ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"],
    });
    confetti({
      ...defaults,
      particleCount,
      origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
      colors: ["#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1"],
    });
  }, 250);
}

// Cannon burst from bottom
export function celebrateCannon() {
  const count = 200;
  const defaults = {
    ...confettiConfig,
    origin: { y: 0.9 },
    zIndex: 9999,
  };

  function fire(particleRatio: number, opts: confetti.Options) {
    confetti({
      ...defaults,
      ...opts,
      particleCount: Math.floor(count * particleRatio),
    });
  }

  fire(0.25, {
    spread: 26,
    startVelocity: 55,
    colors: ["#3b82f6", "#60a5fa"],
  });
  fire(0.2, {
    spread: 60,
    colors: ["#10b981", "#34d399"],
  });
  fire(0.35, {
    spread: 100,
    decay: 0.91,
    scalar: 0.8,
    colors: ["#f59e0b", "#fbbf24"],
  });
  fire(0.1, {
    spread: 120,
    startVelocity: 25,
    decay: 0.92,
    scalar: 1.2,
    colors: ["#8b5cf6", "#a78bfa"],
  });
  fire(0.1, {
    spread: 120,
    startVelocity: 45,
    colors: ["#ef4444", "#f87171"],
  });
}

// Sparkle effect for smaller achievements
export function celebrateSparkle() {
  confetti({
    ...confettiConfig,
    particleCount: 60,
    spread: 50,
    origin: { y: 0.55 },
    colors: ["#ffd700", "#ffec8b", "#fff8dc"],
    shapes: ["star"],
    scalar: 1.2,
  });
}

// School pride / military-style confetti (red, white, blue)
export function celebratePatriotic() {
  const colors = ["#002868", "#bf0a30", "#ffffff"];
  
  confetti({
    ...confettiConfig,
    particleCount: 80,
    spread: 70,
    origin: { y: 0.6 },
    colors,
  });

  setTimeout(() => {
    confetti({
      ...confettiConfig,
      particleCount: 40,
      angle: 60,
      spread: 45,
      origin: { x: 0 },
      colors,
    });
    confetti({
      ...confettiConfig,
      particleCount: 40,
      angle: 120,
      spread: 45,
      origin: { x: 1 },
      colors,
    });
  }, 200);
}

// Fireworks effect
export function celebrateFireworks() {
  const duration = 2500;
  const animationEnd = Date.now() + duration;
  const defaults = { ...confettiConfig, startVelocity: 25, spread: 360, ticks: 50, zIndex: 9999 };

  function randomInRange(min: number, max: number) {
    return Math.random() * (max - min) + min;
  }

  const interval = setInterval(() => {
    const timeLeft = animationEnd - Date.now();

    if (timeLeft <= 0) {
      return clearInterval(interval);
    }

    const particleCount = 40;

    // Random firework positions
    confetti({
      ...defaults,
      particleCount,
      origin: { x: randomInRange(0.2, 0.8), y: randomInRange(0.2, 0.5) },
      colors: ["#ff0000", "#ff7700", "#ffff00"],
      gravity: 0.8,
    });
  }, 400);
}

// The ultimate celebration - combines multiple effects
export function celebrateUltimate() {
  // Initial burst
  celebrateCannon();
  
  // Delayed fireworks
  setTimeout(() => {
    celebrateFireworks();
  }, 500);
}

