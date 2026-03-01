# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Obsidian plugin for Pomodoro time tracking with an analog clock visualization. The timer counts down with visual feedback using SVG-based clock hands (minute hand shows countdown progress, second hand shows current seconds).

## Development Commands

```bash
# Install dependencies
npm i

# Development build with watch mode (compiles src/main.ts to main.js)
npm run dev

# Production build (minified, no source maps)
npm run build

# Lint code
npm run lint

# Bump version (updates manifest.json, package.json, and versions.json)
npm version patch|minor|major
```

## Architecture

### Entry Point and Plugin Structure

- **src/main.ts**: Main plugin class (`PomodoroTimerPlugin`) extending Obsidian's `Plugin`
  - Registers the custom view type (`VIEW_TYPE_POMODORO`)
  - Adds ribbon icon and command to open the timer
  - `activateView()` pattern: reuses existing leaves of the same view type, otherwise creates new tab
  - Manages settings via `loadSettings()`/`saveSettings()`

### View Architecture

- **src/pomodoroView.ts**: `PomodoroView` extends `ItemView`
  - Handles the timer UI and logic
  - Uses SVG to render analog clock with 60 tick marks, a second hand, and center dot
  - Clock dimensions: 200x200 viewBox, center at (100, 100), radius 93
  - State: `timerSeconds`, `initialSeconds`, `isRunning`, `intervalId`
  - Clock hands rotate via SVG `transform` attribute around the center point
  - Second hand shows current second within countdown (rotates clockwise, 0-59 seconds)
  - Tick marks positioned using trigonometry with -90° offset to start from 12 o'clock

### Settings

- **src/settings.ts**: `PomodoroSettings` interface and `PomodoroSettingTab`
  - Configurable: workDuration, breakDuration, longBreakDuration (in minutes)
  - Note: `PomodoroView` currently only receives `workDuration` at construction - settings changes don't update the view until it's reopened

## Build System

- **esbuild.config.mjs**: Bundles TypeScript to CommonJS
  - Entry: `src/main.ts` → Output: `main.js`
  - External dependencies: obsidian, electron, CodeMirror packages, Node builtin modules
  - Production mode: minified, no source maps
  - Dev mode: inline source maps, file watching enabled

## TypeScript & Linting

- **tsconfig.json**: Strict mode enabled with `noImplicitAny`, `strictNullChecks`, `noUncheckedIndexedAccess`, etc.
- **eslint.config.mts**: Uses `typescript-eslint` with `eslint-plugin-obsidianmd` for Obsidian-specific linting rules

## Key Constants

- `VIEW_TYPE_POMODORO = "pomodoro-timer"`: Registered view type identifier
- Clock center: (100, 100), radius: 93 (defined in `PomodoroView`)
- Default durations: 25min work, 5min short break, 15min long break (in `DEFAULT_SETTINGS`)

## Manual Testing

After building, copy these files to your vault's `.obsidian/plugins/pomodoro-time-tracker/`:
- `main.js`
- `styles.css`
- `manifest.json`

Then reload Obsidian and enable the plugin.
