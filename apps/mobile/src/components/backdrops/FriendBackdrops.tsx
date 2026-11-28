import { useCallback, useMemo } from 'react';
import { AppState, PixelRatio, StyleSheet } from 'react-native';
import { Canvas, Group, Image, Rect, Shader, Skia } from 'react-native-skia';
import { useFocusEffect } from 'expo-router';
import {
  cancelAnimation,
  Easing,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';
import {
  BEA_TEXT_CONTRAST,
  DENISE_TEXT_CONTRAST,
  ERIKA_PALETTE,
  GIUSEPPE_PALETTE,
  HIGA_TEXT_CONTRAST,
  KRISTEN_CONTRAST,
  KRISTEN_PALETTE,
} from '~/lib/theme/theme-tokens';
import { BEA_LANTERN, BEA_LIGHT, BEA_MIST, BEA_SCENE, beaLanternBox } from './bea-shader';
import {
  DENISE_AIR,
  DENISE_FIGURE,
  DENISE_GEOMETRY,
  DENISE_HEAD,
  DENISE_ROOM,
  DENISE_STEAM,
  deniseHeadPose,
  deniseRegion,
  deniseScale,
} from './denise-shader';
import { ERIKA_MIST, ERIKA_SCENE } from './erika-shader';
import { GIUSEPPE_BOKEH, GIUSEPPE_CAIRN, GIUSEPPE_LAKE } from './giuseppe-shader';
import { HIGA_SCENE } from './higa-shader';
import {
  KRISTEN_LIFE,
  KRISTEN_MIST,
  KRISTEN_SCENE,
  kristenLifeBand,
} from './kristen-shader';
import {
  MeasuredHost,
  rgb,
  useForwardTime,
  useShaderTexture,
  type Size,
} from './scene-kit';

const deniseRoom = Skia.RuntimeEffect.Make(DENISE_ROOM);
const deniseFigure = Skia.RuntimeEffect.Make(DENISE_FIGURE);
const deniseHead = Skia.RuntimeEffect.Make(DENISE_HEAD);
const deniseAir = Skia.RuntimeEffect.Make(DENISE_AIR);
const deniseSteam = Skia.RuntimeEffect.Make(DENISE_STEAM);
const erikaScene = Skia.RuntimeEffect.Make(ERIKA_SCENE);
const erikaMist = Skia.RuntimeEffect.Make(ERIKA_MIST);
const giuseppeLake = Skia.RuntimeEffect.Make(GIUSEPPE_LAKE);
const giuseppeCairn = Skia.RuntimeEffect.Make(GIUSEPPE_CAIRN);
const giuseppeBokeh = Skia.RuntimeEffect.Make(GIUSEPPE_BOKEH);
const kristenScene = Skia.RuntimeEffect.Make(KRISTEN_SCENE);
const kristenMist = Skia.RuntimeEffect.Make(KRISTEN_MIST);
const kristenLife = Skia.RuntimeEffect.Make(KRISTEN_LIFE);
const higaScene = Skia.RuntimeEffect.Make(HIGA_SCENE);
const beaScene = Skia.RuntimeEffect.Make(BEA_SCENE);
const beaMist = Skia.RuntimeEffect.Make(BEA_MIST);
const beaLight = Skia.RuntimeEffect.Make(BEA_LIGHT);
const beaLantern = Skia.RuntimeEffect.Make(BEA_LANTERN);

/** Seconds of drift before the motion eases back; slow enough to feel ambient. */
const CYCLE = 60;

/** Seconds of ambient motion, easing back and forth; frozen for previews,
 *  Reduce Motion, unfocused screens and the background. */
function useAmbientTime(preview: boolean) {
  const reducedMotion = useReducedMotion();
  const phase = useSharedValue(0);
  useFocusEffect(
    useCallback(() => {
      const stop = () => cancelAnimation(phase);
      if (preview || reducedMotion) {
        stop();
        phase.value = 0;
        return stop;
      }
      const start = () => {
        stop();
        // Resume from the paused point: finish this leg, then swing 1 → 0 → 1.
        // (Repeating from the paused value would only swing between it and 1.)
        const from = phase.value;
        phase.value = withSequence(
          withTiming(1, {
            duration: (1 - from) * CYCLE * 1000,
            easing: Easing.out(Easing.sin),
          }),
          withRepeat(
            withTiming(0, { duration: CYCLE * 1000, easing: Easing.inOut(Easing.sin) }),
            -1,
            true,
          ),
        );
      };
      if (AppState.currentState === 'active') start();
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') start();
        else stop();
      });
      return () => {
        subscription.remove();
        stop();
      };
    }, [preview, reducedMotion, phase]),
  );
  return useDerivedValue(() => phase.value * CYCLE);
}

export function DeniseBackdrop({ preview = false }: { preview?: boolean }) {
  return (
    <MeasuredHost>{(size) => <DeniseScene {...size} preview={preview} />}</MeasuredHost>
  );
}

function DeniseScene({ width, height, preview }: Size & { preview: boolean }) {
  const [background, foreground] = useCSSVariable([
    '--color-background',
    '--color-foreground',
  ]);
  // The head loop, rain and drips must resume where they paused.
  const time = useForwardTime(preview);
  const bg = typeof background === 'string' ? background : '#121b27';
  const ink = typeof foreground === 'string' ? foreground : '#dfe7f0';
  const scene = useMemo(
    () => ({
      size: [width, height],
      ink: rgb(ink),
      ceilRatio: DENISE_TEXT_CONTRAST,
    }),
    [width, height, ink],
  );
  const full = useMemo(() => ({ x: 0, y: 0, width, height }), [width, height]);
  const regions = useMemo(
    () => ({
      glass: deniseRegion(width, height, 'glass'),
      figure: deniseRegion(width, height, 'figure'),
      head: deniseRegion(width, height, 'head'),
      steam: deniseRegion(width, height, 'steam'),
    }),
    [width, height],
  );
  const density = PixelRatio.get();
  const room = useShaderTexture(deniseRoom, scene, full, density);
  const figure = useShaderTexture(deniseFigure, scene, regions.figure, density);
  const head = useShaderTexture(deniseHead, scene, regions.head, density);
  const s = deniseScale(width, height);
  const pivot = useMemo(
    () => ({
      x: width / 2 + DENISE_GEOMETRY.pivot.x * s,
      y: DENISE_GEOMETRY.pivot.y * s,
    }),
    [width, s],
  );
  const headTransform = useDerivedValue(() => {
    const pose = deniseHeadPose(time.value);
    return [
      { translateX: pose.dx * s },
      { translateY: pose.dy * s },
      { rotate: pose.angle },
    ];
  });
  const moving = useDerivedValue(() => ({ ...scene, time: time.value }));

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* The theme colour shows until the textures are ready, or if a shader fails. */}
      <Rect x={0} y={0} width={width} height={height} color={bg} />
      <Image image={room} x={0} y={0} width={width} height={height} fit="fill" />
      {deniseAir && (
        <Rect {...regions.glass}>
          <Shader source={deniseAir} uniforms={moving} />
        </Rect>
      )}
      <Image image={figure} {...regions.figure} fit="fill" />
      <Group origin={pivot} transform={headTransform}>
        <Image image={head} {...regions.head} fit="fill" />
      </Group>
      {deniseSteam && (
        <Rect {...regions.steam}>
          <Shader source={deniseSteam} uniforms={moving} />
        </Rect>
      )}
    </Canvas>
  );
}

export function ErikaBackdrop({ preview = false }: { preview?: boolean }) {
  return (
    <MeasuredHost>{(size) => <ErikaScene {...size} preview={preview} />}</MeasuredHost>
  );
}

function ErikaScene({ width, height, preview }: Size & { preview: boolean }) {
  const [background, foreground] = useCSSVariable([
    '--color-background',
    '--color-foreground',
  ]);
  const time = useAmbientTime(preview);
  const sky = typeof background === 'string' ? background : ERIKA_PALETTE.fog;
  const ink = typeof foreground === 'string' ? foreground : ERIKA_PALETTE.near;
  const scene = useMemo(
    () => ({
      size: [width, height],
      sky: rgb(sky),
      ridge: rgb(ERIKA_PALETTE.ridge),
      near: rgb(ERIKA_PALETTE.near),
      fogCol: rgb(ERIKA_PALETTE.fog),
      sun: rgb(ERIKA_PALETTE.sun),
      ink: rgb(ink),
    }),
    [width, height, sky, ink],
  );
  const full = useMemo(() => ({ x: 0, y: 0, width, height }), [width, height]);
  const texture = useShaderTexture(erikaScene, scene, full, PixelRatio.get());
  const mist = useDerivedValue(() => ({
    size: scene.size,
    time: time.value,
    fogCol: scene.fogCol,
  }));

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* The theme colour shows until the texture is ready, or if the shader fails. */}
      <Rect x={0} y={0} width={width} height={height} color={sky} />
      <Image image={texture} x={0} y={0} width={width} height={height} fit="fill" />
      {erikaMist && (
        <Rect x={0} y={height * 0.45} width={width} height={height * 0.55}>
          <Shader source={erikaMist} uniforms={mist} />
        </Rect>
      )}
    </Canvas>
  );
}

export function GiuseppeBackdrop({ preview = false }: { preview?: boolean }) {
  return (
    <MeasuredHost>{(size) => <GiuseppeScene {...size} preview={preview} />}</MeasuredHost>
  );
}

function GiuseppeScene({ width, height, preview }: Size & { preview: boolean }) {
  const background = useCSSVariable('--color-background');
  const time = useAmbientTime(preview);
  const deep = typeof background === 'string' ? background : '#10262a';
  const colors = useMemo(
    () => ({
      size: [width, height],
      deep: rgb(deep),
      haze: rgb(GIUSEPPE_PALETTE.haze),
      warm: rgb(GIUSEPPE_PALETTE.warm),
    }),
    [width, height, deep],
  );
  const stones = useMemo(
    () => ({
      ...colors,
      stoneA: rgb(GIUSEPPE_PALETTE.stoneA),
      stoneB: rgb(GIUSEPPE_PALETTE.stoneB),
    }),
    [colors],
  );
  const full = useMemo(() => ({ x: 0, y: 0, width, height }), [width, height]);
  // The cairn stands in the bottom-right corner (see stoneShape in the shader:
  // the boulder reaches 0.70 × width − 150 pt, the top stone about 225 pt up); bake only that.
  const corner = useMemo(() => {
    const scale = Math.min(width / 390, height / 700);
    const x = Math.max(0, Math.floor(width * 0.7 - 175 * scale));
    const y = Math.max(0, Math.floor(height - 260 * scale));
    return { x, y, width: width - x, height: height - y };
  }, [width, height]);
  // The lake is all soft focus, so one pixel per point is enough.
  const lake = useShaderTexture(giuseppeLake, colors, full, 1);
  const cairn = useShaderTexture(giuseppeCairn, stones, corner, PixelRatio.get());
  const bokeh = useDerivedValue(() => ({
    size: colors.size,
    time: time.value,
    haze: colors.haze,
    warm: colors.warm,
  }));

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* The theme colour shows until the textures are ready, or if a shader fails. */}
      <Rect x={0} y={0} width={width} height={height} color={deep} />
      <Image image={lake} x={0} y={0} width={width} height={height} fit="fill" />
      {giuseppeBokeh && (
        <Rect
          x={0}
          y={height * 0.55}
          width={width}
          height={height * 0.45}
          blendMode="plus">
          <Shader source={giuseppeBokeh} uniforms={bokeh} />
        </Rect>
      )}
      <Image image={cairn} {...corner} fit="fill" />
    </Canvas>
  );
}

export function KristenBackdrop({ preview = false }: { preview?: boolean }) {
  return (
    <MeasuredHost>{(size) => <KristenScene {...size} preview={preview} />}</MeasuredHost>
  );
}

function KristenScene({ width, height, preview }: Size & { preview: boolean }) {
  const [background, foreground] = useCSSVariable([
    '--color-background',
    '--color-foreground',
  ]);
  // The hiker's wave and the hawk's loop need time that only moves forward.
  const time = useForwardTime(preview);
  const sky = typeof background === 'string' ? background : KRISTEN_PALETTE.haze;
  const ink = typeof foreground === 'string' ? foreground : KRISTEN_PALETTE.pine;
  const scene = useMemo(
    () => ({
      size: [width, height],
      sky: rgb(sky),
      skyTop: rgb(KRISTEN_PALETTE.skyTop),
      granite: rgb(KRISTEN_PALETTE.granite),
      shade: rgb(KRISTEN_PALETTE.shade),
      streak: rgb(KRISTEN_PALETTE.streak),
      pine: rgb(KRISTEN_PALETTE.pine),
      haze: rgb(KRISTEN_PALETTE.haze),
      sun: rgb(KRISTEN_PALETTE.sun),
      ink: rgb(ink),
      bold: KRISTEN_CONTRAST.wall,
      forestBold: KRISTEN_CONTRAST.forest,
      floorRatio: KRISTEN_CONTRAST.floor,
    }),
    [width, height, sky, ink],
  );
  const full = useMemo(() => ({ x: 0, y: 0, width, height }), [width, height]);
  const band = useMemo(() => kristenLifeBand(width, height), [width, height]);
  const texture = useShaderTexture(kristenScene, scene, full, PixelRatio.get());
  const mist = useDerivedValue(() => ({
    size: scene.size,
    time: time.value,
    haze: scene.haze,
  }));
  const life = useDerivedValue(() => ({
    size: scene.size,
    time: time.value,
    ink: scene.ink,
    haze: scene.haze,
    floorRatio: scene.floorRatio,
  }));

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* The theme colour shows until the texture is ready, or if the shader fails. */}
      <Rect x={0} y={0} width={width} height={height} color={sky} />
      <Image image={texture} x={0} y={0} width={width} height={height} fit="fill" />
      {kristenMist && (
        // The mist bands centre on 0.75 and 0.86 of the height (see KRISTEN_MIST).
        <Rect x={0} y={height * 0.62} width={width} height={height * 0.38}>
          <Shader source={kristenMist} uniforms={mist} />
        </Rect>
      )}
      {kristenLife && (
        <Rect {...band}>
          <Shader source={kristenLife} uniforms={life} />
        </Rect>
      )}
    </Canvas>
  );
}

export function HigaBackdrop({ preview = false }: { preview?: boolean }) {
  return (
    <MeasuredHost>{(size) => <HigaScene {...size} preview={preview} />}</MeasuredHost>
  );
}

function HigaScene({ width, height, preview }: Size & { preview: boolean }) {
  const [background, foreground] = useCSSVariable([
    '--color-background',
    '--color-foreground',
  ]);
  // The blobs drift on loops that must resume where they paused.
  const time = useForwardTime(preview);
  const bg = typeof background === 'string' ? background : '#170c27';
  const ink = typeof foreground === 'string' ? foreground : '#efe6fb';
  const colors = useMemo(
    () => ({
      size: [width, height],
      bg: rgb(bg),
      ink: rgb(ink),
      ceilRatio: HIGA_TEXT_CONTRAST,
    }),
    [width, height, bg, ink],
  );
  const uniforms = useDerivedValue(() => ({ ...colors, time: time.value }));

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* The theme colour shows if the shader fails. */}
      <Rect x={0} y={0} width={width} height={height} color={bg} />
      {higaScene && (
        <Rect x={0} y={0} width={width} height={height}>
          <Shader source={higaScene} uniforms={uniforms} />
        </Rect>
      )}
    </Canvas>
  );
}

export function BeaBackdrop({ preview = false }: { preview?: boolean }) {
  return (
    <MeasuredHost>{(size) => <BeaScene {...size} preview={preview} />}</MeasuredHost>
  );
}

function BeaScene({ width, height, preview }: Size & { preview: boolean }) {
  const [background, foreground] = useCSSVariable([
    '--color-background',
    '--color-foreground',
  ]);
  // The lantern's swing and the fireflies' loops must resume where they paused.
  const time = useForwardTime(preview);
  const bg = typeof background === 'string' ? background : '#16211a';
  const ink = typeof foreground === 'string' ? foreground : '#d7e3d2';
  const scene = useMemo(
    () => ({
      size: [width, height],
      bg: rgb(bg),
      ink: rgb(ink),
      ceilRatio: BEA_TEXT_CONTRAST,
    }),
    [width, height, bg, ink],
  );
  const full = useMemo(() => ({ x: 0, y: 0, width, height }), [width, height]);
  const lanternBox = useMemo(() => beaLanternBox(width, height), [width, height]);
  const texture = useShaderTexture(beaScene, scene, full, PixelRatio.get());
  const mist = useDerivedValue(() => ({ size: scene.size, time: time.value }));
  const light = useDerivedValue(() => ({ ...scene, time: time.value }));
  const lantern = useDerivedValue(() => ({
    size: scene.size,
    time: time.value,
    ink: scene.ink,
    ceilRatio: scene.ceilRatio,
  }));

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* The theme colour shows until the texture is ready, or if a shader fails. */}
      <Rect x={0} y={0} width={width} height={height} color={bg} />
      <Image image={texture} x={0} y={0} width={width} height={height} fit="fill" />
      {beaMist && (
        // The mist rises from 0.70 of the height (mistBand in bea-shader.ts).
        <Rect x={0} y={height * 0.7} width={width} height={height * 0.3}>
          <Shader source={beaMist} uniforms={mist} />
        </Rect>
      )}
      {beaLight && (
        <Rect x={0} y={0} width={width} height={height} blendMode="plus">
          <Shader source={beaLight} uniforms={light} />
        </Rect>
      )}
      {beaLantern && (
        <Rect {...lanternBox}>
          <Shader source={beaLantern} uniforms={lantern} />
        </Rect>
      )}
    </Canvas>
  );
}
