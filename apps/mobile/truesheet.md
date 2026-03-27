# React Native True Sheet — Reference Guide

> **Package**: `@lodev09/react-native-true-sheet` v3.9.9
> **Docs**: https://sheet.lodev09.com
> Uses **native** iOS `UISheetPresentationController` and Android `BottomSheet`.

---

## Quick Start

```tsx
import { useRef } from 'react';
import { TrueSheet } from '@lodev09/react-native-true-sheet';

function MyComponent() {
  const sheet = useRef<TrueSheet>(null);

  const present = () => sheet.current?.present();
  const dismiss = () => sheet.current?.dismiss();

  return (
    <>
      <Button onPress={present} title="Open Sheet" />
      <TrueSheet ref={sheet} detents={['auto']} cornerRadius={24} grabber>
        <Text>Sheet content goes here</Text>
        <Button onPress={dismiss} title="Close" />
      </TrueSheet>
    </>
  );
}
```

---

## Configuration Props

| Prop                    | Type                                            | Default             | Description                                                                                                              |
| ----------------------- | ----------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `ref`                   | `Ref<TrueSheet>`                                | —                   | Ref for calling imperative methods                                                                                       |
| `name`                  | `string`                                        | —                   | Unique name for global/static method access                                                                              |
| `detents`               | `SheetDetent[]`                                 | `[0.5, 1]`          | Array of stop points. Max 3. Values: `'auto'` or `0`–`1` (fraction of screen). Sort smallest → largest                   |
| `cornerRadius`          | `number`                                        | system default      | Sheet corner radius. `0` for sharp corners                                                                               |
| `backgroundColor`       | `ColorValue`                                    | system default      | Sheet background color                                                                                                   |
| `backgroundBlur`        | `BackgroundBlur`                                | —                   | iOS blur style: `'light'`, `'dark'`, `'default'`, `'extra-light'`, `'regular'`, `'prominent'`, `'system-material'`, etc. |
| `blurOptions`           | `{ intensity?: number, interaction?: boolean }` | —                   | Customize blur. `intensity`: 0–100. `interaction`: allow touch on blur view (default `true`)                             |
| `grabber`               | `boolean`                                       | `true`              | Show native drag handle                                                                                                  |
| `grabberOptions`        | `GrabberOptions`                                | —                   | Customize grabber: `{ width, height, topMargin, cornerRadius, color, adaptive }`                                         |
| `dimmed`                | `boolean`                                       | `true`              | Dim background. Set `false` to allow background interaction                                                              |
| `dimmedDetentIndex`     | `number`                                        | `0`                 | Detent index at which dimming starts                                                                                     |
| `dismissible`           | `boolean`                                       | `true`              | Allow interactive dismissal (drag/tap outside)                                                                           |
| `draggable`             | `boolean`                                       | `true`              | Allow drag-to-resize. When `false`, grabber is auto-hidden                                                               |
| `initialDetentIndex`    | `number`                                        | `-1`                | Auto-present at this detent index on mount. `-1` = don't auto-present                                                    |
| `initialDetentAnimated` | `boolean`                                       | `true`              | Animate the initial auto-present                                                                                         |
| `maxContentHeight`      | `number`                                        | —                   | Max sheet content height in px                                                                                           |
| `maxContentWidth`       | `number`                                        | 640dp (Android/Web) | Max width. Ignored on phones in portrait                                                                                 |
| `anchor`                | `'left' \| 'center' \| 'right'`                 | `'center'`          | Horizontal anchor. Ignored on phones in portrait                                                                         |
| `anchorOffset`          | `number`                                        | `16`                | Edge offset when anchor is `left`/`right`                                                                                |
| `elevation`             | `number`                                        | `4`                 | Shadow depth (Android/Web)                                                                                               |
| `header`                | `ComponentType \| ReactElement`                 | —                   | Fixed header component at top of sheet                                                                                   |
| `headerStyle`           | `StyleProp<ViewStyle>`                          | —                   | Style for header container                                                                                               |
| `footer`                | `ComponentType \| ReactElement`                 | —                   | Floating footer component at bottom                                                                                      |
| `footerStyle`           | `StyleProp<ViewStyle>`                          | —                   | Style for footer container                                                                                               |
| `scrollable`            | `boolean`                                       | `false`             | Auto-pin ScrollView/FlatList inside sheet. ⚠️ Don't use with `'auto'` detent                                             |
| `pageSizing`            | `boolean`                                       | `true`              | iPad: `true` = page sheet, `false` = form sheet                                                                          |
| `insetAdjustment`       | `'automatic' \| 'never'`                        | `'automatic'`       | How bottom safe area affects detent height                                                                               |
| `detached`              | `boolean`                                       | `false`             | Render as floating card (Web)                                                                                            |
| `detachedOffset`        | `number`                                        | `16`                | Bottom offset when detached (Web)                                                                                        |
| `stackBehavior`         | `'push' \| 'switch' \| 'replace' \| 'none'`     | `'switch'`          | How stacked modals behave (Web)                                                                                          |
| `style`                 | `StyleProp<ViewStyle>`                          | —                   | Container style override                                                                                                 |

---

## Imperative Methods (via ref)

```tsx
const sheet = useRef<TrueSheet>(null);
```

### `present(index?: number, animated?: boolean): Promise<void>`

Present the sheet. Optional detent index (default `0`) and animation flag (default `true`).

```tsx
await sheet.current?.present(); // Present at first detent
await sheet.current?.present(1); // Present at second detent
await sheet.current?.present(0, false); // Present without animation
```

### `dismiss(animated?: boolean): Promise<void>`

Dismiss the sheet and all sheets on top of it.

```tsx
await sheet.current?.dismiss();
await sheet.current?.dismiss(false); // Without animation
```

### `dismissStack(animated?: boolean): Promise<void>`

Dismiss only sheets presented on top of this one, keeping this sheet open.

```tsx
await sheet.current?.dismissStack();
```

### `resize(index: number): Promise<void>`

Resize to a different detent. Sheet must be presented first.

```tsx
await sheet.current?.resize(1); // Resize to second detent
```

---

## Global Methods

Global methods allow you to present or dismiss any named sheet from anywhere, without passing refs down the component tree.

First, define the sheet with a unique `name` prop:

```tsx
const App = () => {
  return (
    <TrueSheet name="my-sheet">
      <View />
    </TrueSheet>
  );
};
```

Then, present or dismiss the sheet globally using its name:

```tsx
import { TrueSheet } from '@lodev09/react-native-true-sheet';

const SomeComponent = () => {
  return (
    <>
      <Button onPress={() => TrueSheet.present('my-sheet')} title="Present" />
      <Button onPress={() => TrueSheet.dismiss('my-sheet')} title="Dismiss" />
    </>
  );
};
```

### Advanced Examples

```tsx
await TrueSheet.present('settings-sheet');
await TrueSheet.present('settings-sheet', 0, false); // No animation
await TrueSheet.dismiss('settings-sheet');
await TrueSheet.dismissStack('settings-sheet');
await TrueSheet.resize('settings-sheet', 1);
await TrueSheet.dismissAll(); // Dismiss all sheets in current stack
```

> **Web**: Static methods are not supported. Use the `useTrueSheet()` hook instead:
>
> ```tsx
> import { useTrueSheet } from '@lodev09/react-native-true-sheet';
> const { present, dismiss, dismissStack, resize, dismissAll } = useTrueSheet();
> ```

---

## Lifecycle Events

| Event              | Payload                      | Description                                                             |
| ------------------ | ---------------------------- | ----------------------------------------------------------------------- |
| `onMount`          | `null`                       | Sheet content mounted and ready. Sheet waits for this before presenting |
| `onWillPresent`    | `DetentInfoEventPayload`     | About to be presented                                                   |
| `onDidPresent`     | `DetentInfoEventPayload`     | Has been presented                                                      |
| `onWillDismiss`    | `null`                       | About to be dismissed                                                   |
| `onDidDismiss`     | `null`                       | Has been dismissed                                                      |
| `onDetentChange`   | `DetentInfoEventPayload`     | Detent changed (drag or programmatic)                                   |
| `onDragBegin`      | `DetentInfoEventPayload`     | Drag started                                                            |
| `onDragChange`     | `DetentInfoEventPayload`     | Drag in progress                                                        |
| `onDragEnd`        | `DetentInfoEventPayload`     | Drag ended                                                              |
| `onPositionChange` | `PositionChangeEventPayload` | Continuous position updates (for animations)                            |
| `onWillFocus`      | `null`                       | About to gain focus (presented or child sheet dismissing)               |
| `onDidFocus`       | `null`                       | Gained focus                                                            |
| `onWillBlur`       | `null`                       | About to lose focus (another sheet presenting on top)                   |
| `onDidBlur`        | `null`                       | Lost focus                                                              |
| `onBackPress`      | `null`                       | Android hardware back pressed                                           |

### Event Payload Types

```ts
interface DetentInfoEventPayload {
  index: number; // Detent index from provided `detents` array
  position: number; // Y position relative to screen
  detent: number; // Detent value (0-1)
}

interface PositionChangeEventPayload extends DetentInfoEventPayload {
  realtime: boolean; // true during drag/animation tracking; false = animate in JS
}
```

---

## Common Patterns

### Auto-sized bottom sheet (menu/action sheet)

```tsx
<TrueSheet ref={sheet} detents={['auto']} cornerRadius={24} grabber>
  <View style={{ padding: 16 }}>
    <Pressable
      onPress={() => {
        dismiss();
        doAction();
      }}>
      <Text>Action 1</Text>
    </Pressable>
    <Pressable
      onPress={() => {
        dismiss();
        doOtherAction();
      }}>
      <Text>Action 2</Text>
    </Pressable>
  </View>
</TrueSheet>
```

### Half-expanded + full-expanded

```tsx
<TrueSheet ref={sheet} detents={[0.5, 1]} cornerRadius={16}>
  <ScrollView>{/* long content */}</ScrollView>
</TrueSheet>
```

### Non-dismissible (confirmation dialog)

```tsx
<TrueSheet ref={sheet} detents={['auto']} dismissible={false} grabber={false}>
  <Text>Are you sure?</Text>
  <Button
    onPress={() => {
      confirm();
      dismiss();
    }}
    title="Yes"
  />
  <Button onPress={dismiss} title="Cancel" />
</TrueSheet>
```

### With blur background (iOS)

```tsx
<TrueSheet
  ref={sheet}
  detents={['auto', 0.8]}
  backgroundBlur="system-material"
  blurOptions={{ intensity: 60 }}>
  <View />
</TrueSheet>
```

### Scrollable content (use fixed detents, NOT 'auto')

```tsx
<TrueSheet ref={sheet} detents={[0.5, 1]} scrollable>
  <FlatList data={items} renderItem={...} />
</TrueSheet>
```

### With fixed header and footer

```tsx
<TrueSheet
  ref={sheet}
  detents={[0.5, 1]}
  header={<Text style={{ padding: 16, fontWeight: 'bold' }}>Title</Text>}
  footer={<Button title="Done" onPress={dismiss} />}
  scrollable
>
  <FlatList data={items} renderItem={...} />
</TrueSheet>
```

---

## Key Types (re-exported from package)

```ts
import type {
  TrueSheetProps,
  SheetDetent,
  BackgroundBlur,
  BlurOptions,
  GrabberOptions,
  StackBehavior,
  InsetAdjustment,
  DetentInfoEventPayload,
  PositionChangeEventPayload,
} from '@lodev09/react-native-true-sheet';
```

---

## Tips

- **Max 3 detents**: collapsed, half-expanded, expanded.
- **Sort detents smallest → largest**.
- **`'auto'` detent**: sizes to content. Don't combine with `scrollable`.
- **`name` prop**: must be unique across your app for global methods to work.
- **`grabber` auto-hides** when `draggable={false}`.
- **iOS 26+**: omitting `backgroundColor` enables Liquid Glass effect.

---

## Scrolling Content

Scrolling content within the sheet requires specific configuration for both iOS and Android.

### Basic Setup

Enable the `scrollable` prop on `TrueSheet` and set `nestedScrollEnabled` on your `ScrollView` or `FlatList` to appropriately manage scrolling.

```tsx
const App = () => {
  const sheet = useRef<TrueSheet>(null);

  return (
    <TrueSheet ref={sheet} scrollable>
      <View>{/* Header content */}</View>
      <ScrollView nestedScrollEnabled>
        <View />
      </ScrollView>
    </TrueSheet>
  );
};
```

> **Note**: By default, `scrollable` is `false`. Set it to `true` to enable automatic ScrollView fitting.
>
> **Warning**: The `'auto'` detent is not compatible with `scrollable`. Use fixed fractional detents (e.g., `0.5`, `0.8`, `1`) instead.

### iOS

On iOS, `scrollable` automatically pins scroll views (`ScrollView` or `FlatList`) to fit within the sheet's available space. The detection supports up to 2 levels deep in the view hierarchy.

```tsx
<TrueSheet scrollable>
  <View style={{ flex: 1 }}>
    <View>{/* Header content */}</View>
    <FlatList nestedScrollEnabled data={data} renderItem={renderItem} />
  </View>
</TrueSheet>
```

### Android

On Android, `scrollable` ensures the scroll view fills the available sheet space. `nestedScrollEnabled` is required for scrolling to work.

> **Warning**: `RefreshControl` is incompatible with `nestedScrollEnabled` on Android due to nesting limitations with `SwipeRefreshLayout`. As a workaround, disable `nestedScrollEnabled` to use `RefreshControl`, but provide a separate draggable area (e.g., a header) for the sheet.

### Using `scrollToEnd`

When using `scrollable`, `scrollToEnd()` on lists may fail due to JS-side metric inconsistencies. Use `scrollToOffset` with a large value instead:

```tsx
const scrollRef = useRef<FlatList>(null);

const scrollToEnd = () => {
  // Clamped to max scrollable position
  scrollRef.current?.scrollToOffset({ offset: 99999, animated: true });
};

return (
  <TrueSheet scrollable onDidPresent={scrollToEnd}>
    <FlatList ref={scrollRef} nestedScrollEnabled data={data} renderItem={renderItem} />
  </TrueSheet>
);
```
