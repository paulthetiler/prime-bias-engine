// Win celebration — confetti burst + a little haptic success.
import confetti from 'canvas-confetti';
import { success } from '@/lib/haptics';

export function celebrateWin() {
  success();
  try {
    const fire = (particleRatio, opts) =>
      confetti({
        origin: { y: 0.7 },
        colors: ['#10b981', '#3b82f6', '#eab308', '#ffffff'],
        disableForReducedMotion: true,
        ...opts,
        particleCount: Math.floor(200 * particleRatio),
      });
    fire(0.25, { spread: 26, startVelocity: 55 });
    fire(0.2, { spread: 60 });
    fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 });
    fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
    fire(0.1, { spread: 120, startVelocity: 45 });
  } catch {
    /* confetti is best-effort */
  }
}
