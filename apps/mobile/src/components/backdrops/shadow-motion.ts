function ease(t: number, a: number, b: number) {
  'worklet';
  const v = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return v * v * (3 - 2 * v);
}
function pulse(t: number, a: number, b: number) {
  'worklet';
  return t <= a || t >= b ? 0 : Math.sin(((t - a) / (b - a)) * Math.PI) ** 2;
}
export function shadowPose(time: number, variant: number, idle: number) {
  'worklet';
  if (time < 0)
    return { gaze: 1, turn: 1, tilt: -0.045, blink: 0, mouth: 0, tail: 0, ear: 0 };
  if (time === 0)
    return {
      gaze: 0,
      turn: 0,
      tilt: 0,
      mouth: 0,
      blink: pulse(idle, 5, 5.55) + pulse(idle, 14, 14.6),
      tail: Math.sin((idle * Math.PI) / 4) * 0.75,
      ear:
        -0.25 * pulse(idle, 3.2, 3.48) +
        0.13 * pulse(idle, 3.48, 3.78) -
        0.22 * pulse(idle, 12.4, 12.68) +
        0.11 * pulse(idle, 12.68, 13),
    };
  return {
    gaze: ease(time, 0, 0.25) * (1 - ease(time, 3.65, 4)),
    turn: ease(time, 0.5, 1.4) * (1 - ease(time, 3.1, 3.8)),
    tilt: variant === 0 ? -0.07 * ease(time, 1.4, 1.85) * (1 - ease(time, 2.9, 3.4)) : 0,
    blink: variant === 0 ? pulse(time, 2.15, 2.75) : pulse(time, 2.5, 3),
    mouth: variant === 1 ? pulse(time, 1.6, 2.3) : 0,
    tail: variant === 0 ? Math.sin((time - 2.6) * 9) * pulse(time, 2.6, 3.5) : 0,
    ear: 0,
  };
}
