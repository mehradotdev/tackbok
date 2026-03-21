---
trigger: always_on
---

# Project Environment & Turborepo Structure

- This is a turbo monorepo containing two main apps:
  1. `apps/mobile`: The main mobile app built with React-Native Expo.
  2. `apps/website`: A website built with Astro (located in the website directory).
- **Default Scope:** 85% of the work is focused on the React-Native Expo project. Unless explicitly stated otherwise by the user, assume all tasks, commands, and file modifications should be confined to the `./apps/mobile` directory. Do not modify files outside `apps/mobile` unless required.

# Package Management (Bun)

- **Always** use `bun` as the package manager and as a Node replacement.
- When installing new packages, use `bun add <package>` instead of manually editing the `package.json` file.
- **For Expo/React Native packages** in the mobile app (`apps/mobile`), use `bun expo install <package>` instead of `bun add` to ensure compatibility with the current Expo SDK version.
- Execute project scripts using `bun` (e.g., `bun run <script>`).
- Pay attention to workspaces: Make sure to run `bun add` or `bun expo install` in the correct directory (e.g., inside `apps/mobile`) when adding app-specific dependencies.

# Styling (Tailwind v4)

- Both apps use **Tailwind v4** syntax for styling. Prefer modern Tailwind utility classes over custom CSS whenever possible.
- **Mobile App (`apps/mobile`):** Uses **Uniwind** (a lightweight NativeWind alternative) to style React Native components using Tailwind classes.
- **Website App (`apps/website`):** Uses standard Tailwind CSS v4.

# TypeScript & Code Quality

- **Type Safety:** Try to avoid `as any` or `any` if possible. Try to infer types from functions as much as possible or write strict, robust types/interfaces.
- Follow modern React Native and Expo patterns for the mobile app, and modern Astro patterns for the web app.
