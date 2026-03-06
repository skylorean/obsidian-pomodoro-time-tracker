# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Obsidian plugin for Pomodoro time tracking with an analog clock visualization. The timer counts down with visual feedback using SVG-based clock face with:
- Second hand (shows current second within countdown)
- Circular progress arc (fills as time passes)
- Digital time display (MM:SS format)

Supports Work and Break modes with automatic mode switching after timer completion.

**Additional Features:**
- Integrated todo list with drag-and-drop reordering and inline editing
- Wiki-link support in tasks (`[[filename]]` syntax with autocomplete)
- Sound notifications when timer completes

## Development Commands

```bash
# Install dependencies
npm i

# Development build with watch mode (compiles src/main.ts to main.js AND src/styles/main.scss to styles.css)
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
  - Passes settings to `PomodoroView` on construction

### View Architecture

- **src/pomodoroView.ts**: `PomodoroView` extends `ItemView`
  - Handles the timer UI and logic
  - Uses SVG to render analog clock face with 60 tick marks, second hand, center dot, and progress arc
  - Clock dimensions: 200x200 viewBox, center at (100, 100), radius 93
  - State: `timerSeconds`, `initialSeconds`, `isRunning`, `intervalId`, `mode` (TimerMode)
  - Supports Work/Break mode switching with toggle buttons
  - Integrates with `TimerStorage` for state persistence
  - Second hand shows current second within countdown (rotates clockwise, 0-59 seconds)
  - Tick marks positioned using trigonometry with -90° offset to start from 12 o'clock
  - Progress arc fills clockwise as time passes, different colors for work/break modes
  - **Todo list integration**: Renders and manages todo tasks below the timer
  - **Sound playback**: Plays alarm.mp3 when timer completes (if enabled in settings)
  - **Web Worker**: Uses dedicated worker for accurate 1-second intervals (not throttled in background)

### Timer State Persistence

- **src/timerStorage.ts**: `TimerStorage` class
  - Saves/restores timer state using Obsidian's `app.loadLocalStorage()` / `app.saveLocalStorage()`
  - Storage key: `pomodoro-timer-state`
  - Handles elapsed time calculation for running timers
  - Maximum state age: 24 hours (older states are discarded)
  - Validates state structure and provides backward compatibility for missing `mode` field

### Todo List System

- **src/todoStorage.ts**: `TodoStorage` class
  - Manages persistence of todo list state
  - Storage key: `pomodoro-todo-list`
  - Schema version: 1 (for future migrations)
  - Maximum state age: 30 days (`MAX_TODO_STATE_AGE_MS`)
  - Methods:
    - `save(tasks)`: Persist tasks array
    - `restore()`: Load and validate saved tasks
    - `clear()`: Remove saved state
    - `generateId()`: Create unique task IDs (`todo-{timestamp}-{random}`)
  - Validates state structure with type guard
  - Handles stale state cleanup

### Wiki-link Support

- **src/wikiLinkParser.ts**: Wiki-link parsing utilities
  - Regex: `/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g`
  - `parseWikiLinks(text)`: Parses task text, returns segments array with `hasWikiLinks` flag
  - `hasWikiLinks(text)`: Quick check without full parsing
  - Supports `[[path]]` and `[[path|display text]]` syntax
  - Returns `ParsedTaskText` with array of `TextSegment` and `WikiLinkSegment` objects

### File Suggest Modal

- **src/FileSuggestModal.ts**: `FileSuggestModal` extends `FuzzySuggestModal<TFile>`
  - Provides fuzzy search over vault's markdown files
  - Used for wiki-link autocomplete when typing `[[` in todo input
  - Instructions: ↑↓ navigate, ↵ select, esc close

### Type Definitions

- **src/types.ts**: TypeScript interfaces and types
  - Timer types:
    - `TimerMode`: 'work' | 'break'
    - `TimerState`: Interface for persisted timer state
    - `RestoreResult`: Union type for restore operation results
    - `StorageResult<T>`: Generic result type for storage operations
  - Todo types:
    - `TodoTask`: id, text, completed, createdAt, order
    - `TodoListState`: tasks, savedAt, version
  - Wiki-link parsing types:
    - `TextSegment`: `{ type: 'text'; content: string }`
    - `WikiLinkSegment`: `{ type: 'wikilink'; path: string; displayText?: string }`
    - `ParsedTaskText`: `{ segments: Array<TextSegment | WikiLinkSegment>; hasWikiLinks: boolean }`

### Settings

- **src/settings.ts**: `PomodoroSettings` interface and `PomodoroSettingTab`
  - Configurable:
    - `workDuration`: number (minutes, default: 25)
    - `breakDuration`: number (minutes, default: 5)
    - `longBreakDuration`: number (minutes, default: 15)
    - `soundEnabled`: boolean (default: true)
    - `soundVolume`: number 0-100 (default: 70)
  - Note: `PomodoroView` receives settings at construction - settings changes don't update the view until it's reopened

### Styles Architecture

- **src/styles/main.scss**: Entry point for styles, uses @use to import modules
- **src/styles/_variables.scss**: SCSS variables (colors, sizes)
- **src/styles/components/**: Component-specific styles
  - `_base.scss`: Base container and layout
  - `_clock.scss`: SVG clock face, tick marks, second hand
  - `_progress.scss`: Circular progress arc (work/break colors)
  - `_display.scss`: Digital time display
  - `_buttons.scss`: Start/Pause/End session buttons
  - `_toggle.scss`: Work/Break mode toggle buttons
  - `_todo.scss`: Todo list component (task items, drag-and-drop indicators, completion status, wiki-links)

### Assets

- **alarm.mp3**: Sound effect played when timer completes

## Build System

- **esbuild.config.mjs**: Bundles TypeScript and SCSS separately
  - **JS bundle**: Entry `src/main.ts` → Output `main.js`
  - **CSS bundle**: Entry `src/styles/main.scss` → Output `styles.css`
  - Uses `esbuild-sass-plugin` for SCSS compilation
  - External dependencies: obsidian, electron, CodeMirror packages, Node builtin modules
  - Production mode: minified, no source maps
  - Dev mode: inline source maps, file watching enabled for both JS and CSS

## TypeScript & Linting

- **tsconfig.json**: Strict mode enabled with `noImplicitAny`, `strictNullChecks`, `noUncheckedIndexedAccess`, etc.
- **eslint.config.mts**: Uses `typescript-eslint` with `eslint-plugin-obsidianmd` for Obsidian-specific linting rules

## Key Constants

- `VIEW_TYPE_POMODORO = "pomodoro-timer"`: Registered view type identifier
- `STORAGE_KEY = "pomodoro-timer-state"`: localStorage key for timer state
- `TODO_STORAGE_KEY = "pomodoro-todo-list"`: localStorage key for todo state
- `TODO_SCHEMA_VERSION = 1`: Current todo schema version
- Clock center: (100, 100), radius: 93 (defined in `PomodoroView`)
- Default durations: 25min work, 5min short break, 15min long break (in `DEFAULT_SETTINGS`)
- Maximum state ages:
  - Timer: 24 hours (`MAX_STATE_AGE_MS` in `TimerStorage`)
  - Todo: 30 days (`MAX_TODO_STATE_AGE_MS` in `TodoStorage`)

## Manual Testing

After building, copy these files to your vault's `.obsidian/plugins/pomodoro-time-tracker/`:
- `main.js`
- `styles.css`
- `manifest.json`
- `alarm.mp3`

Then reload Obsidian and enable the plugin.
