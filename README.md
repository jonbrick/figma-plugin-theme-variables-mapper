# Theme Variables Mapper Plugin Documentation

## Overview

The Theme Variables Mapper is a Figma plugin that automates the creation of theme variables by parsing CSS files and mapping them to existing design tokens in your Figma libraries or local collections. It supports light/dark mode theming and maintains proper variable relationships through Figma's alias system.

## Features

- **CSS @theme Parsing**: Extracts theme variables from CSS files with light/dark mode definitions
- **Flexible Source Collections**: Reference variables from either local collections or external shared libraries
- **Automatic Mode Management**: Creates and configures Light/Dark modes in target collections
- **Opacity Support**: Handles CSS opacity values (e.g., `--alpha(var(--color) / 90%)`)
- **Bulk Processing**: Efficiently handles large sets of variables (tested with 75+ tokens)
- **Smart Console Logging**: Collapsible groups for clean debugging output

## Technical Architecture

### Plugin Structure

```
theme-variables-mapper/
├── manifest.json     # Plugin configuration
├── code.js          # Main plugin logic (ES5 compatible)
├── ui.html          # Plugin interface with inline CSS/JS
└── README.md        # Documentation
```

### Technology Stack

- **JavaScript**: ES5-compatible for Figma plugin environment
- **Figma Plugin API**: For variable and collection management
- **Promise-based**: Async handling for library imports

## How It Works

### 1. CSS Input Format

The plugin expects CSS with this specific structure:

```css
/* Theme variable definitions */
@theme {
  --color-primary: var(--color-blue-500);
  --color-danger: var(--fill-danger);
  /* ... more theme variables ... */
}

/* Light mode values */
:root,
.light {
  --color-blue-500: var(--color-blue-75);
  --fill-danger: var(--color-red-75);
  /* ... with optional opacity ... */
  --stroke-danger: --alpha(var(--color-red-400) / 40%);
}

/* Dark mode values */
.dark {
  --color-blue-500: var(--color-blue-25);
  --fill-danger: --alpha(var(--color-red-500) / 15%);
  --stroke-danger: --alpha(var(--color-red-400) / 50%);
}
```

### 2. Processing Flow

1. **Collection Loading**

   - Loads both library and local collections on startup
   - UI automatically selects first library and first local collection

2. **CSS Parsing**

   - Extracts variables from `@theme` block
   - Maps light/dark mode values
   - Converts CSS naming (hyphens) to Figma naming (slashes)
   - Handles opacity values by appending them with underscore

3. **Variable Creation/Update**
   - Creates theme variables in target collection
   - Sets up proper aliases to source variables
   - Handles library imports asynchronously
   - Maintains light/dark mode values

### 3. Variable Naming Convention

| CSS Format                           | Figma Format       |
| ------------------------------------ | ------------------ |
| `--color-red-500`                    | `color/red/500`    |
| `--color-red-500` (with 90% opacity) | `color/red/500_90` |
| `--fill-danger`                      | `fill/danger`      |
| `--color-primary`                    | `color/primary`    |

## UI Components

### Collection Selection Screen

```
┌─────────────────────────────────────┐
│  📚 Available Collections           │
│  ├─ Library Collections             │
│  │  └─ Design System → Colors      │
│  └─ Local Collections               │
│     └─ Theme Variables (Local)     │
├─────────────────────────────────────┤
│  [Source Collection ▼] [Target ▼]  │
│  [Next: Upload CSS File]            │
└─────────────────────────────────────┘
```

### CSS Upload Screen

```
┌─────────────────────────────────────┐
│  📋 Selected Collections            │
│  Source: Design System → Colors     │
│  Target: Theme Variables (Local)    │
├─────────────────────────────────────┤
│     📁 Upload CSS File              │
│     [Choose File]                   │
└─────────────────────────────────────┘
```

### Preview Screen

```
┌─────────────────────────────────────┐
│  [Cancel]  [Apply Changes]          │
├─────────────────────────────────────┤
│        75 theme variables found     │
├─────────────────────────────────────┤
│  ▼ 🎨 Variables to Create (75)     │
│     color/fill/danger               │
│     └─ Light: color/red/75          │
│     └─ Dark: color/red/500_15       │
└─────────────────────────────────────┘
```

### Results Screen

```
┌─────────────────────────────────────┐
│  [Upload New File]  [Close]         │
├─────────────────────────────────────┤
│  ✅ Created: 70  ✏️ Updated: 5      │
├─────────────────────────────────────┤
│  ▶ ✅ Created Variables (70)        │
│  ▶ ✏️ Updated Variables (5)         │
│  ▶ ❌ Failed Variables (0)          │
└─────────────────────────────────────┘
```

## Key Functions

### code.js

#### `loadCollections()`

- Loads all available collections (library and local)
- Sends collection data to UI for display
- Handles async library loading with proper error handling

#### `parseCSSContent(cssContent)`

- Validates CSS content
- Extracts theme variables using regex
- Converts variable names to Figma format
- Returns structured variable mappings

#### `createVariablesFromCSS(...)`

- Main orchestrator for variable creation
- Routes to library or local processing based on source type
- Manages target collection setup

#### `processLibraryVariables(...)` / `processLocalVariables(...)`

- Handles variable creation with proper alias setup
- Library version uses async imports with Promise.all
- Local version processes synchronously
- Both use console.groupCollapsed for clean logging

### ui.html

#### `loadCollections()`

- Sends message to plugin to load collections
- Called on startup and reset

#### `resetToUpload()`

- Clears state and returns to collection selection
- Calls `loadCollections()` to refresh and restore defaults

#### `populateCollections(libs, locals)`

- Populates dropdown menus
- Auto-selects first library and first local collection

#### `createVariableItem(item, type)`

- Creates DOM elements for variable display
- Shows different info based on preview/results context

## Console Logging

The plugin uses collapsible console groups for clean output:

```javascript
// Normal view
📚 Loading all collections...
✅ Found 1 local collections
✅ Successfully loaded 1 library collections
📄 Parsing CSS content...
✅ Found 75 theme variables
▼ ⚡ Processing 75 variables...    // Click to expand
✅ All library imports completed
📊 === FINAL RESULTS ===
✅ Created: 70
✏️ Updated: 5
❌ Failed: 0

// Expanded view shows all details
▼ ⚡ Processing 75 variables...
  🔄 Processing: color/fill/danger
  ✏️ Updated: color/fill/danger
  🔄 Processing: color/fill/primary
  ✨ Created: color/fill/primary
  // ... all 75 entries
```

## Error Handling

- **Collection Loading**: Falls back to local-only if libraries fail
- **CSS Parsing**: Validates content and shows clear error messages
- **Variable Creation**: Tracks and reports failed variables individually
- **Library Imports**: Handles async failures gracefully

## Best Practices

1. **CSS Organization**

   - Keep `@theme` block clean with only variable mappings
   - Ensure all referenced variables exist in light/dark blocks
   - Use consistent naming conventions

2. **Collection Management**

   - Organize source tokens in a dedicated library
   - Create a separate local collection for theme variables
   - Use descriptive collection names

3. **Large Files**
   - The plugin handles 75+ variables efficiently
   - Results start collapsed for better overview
   - Use console expansion to debug specific issues

## Limitations

- **ES5 Only**: Due to Figma plugin environment constraints
- **Color Variables Only**: Currently supports only COLOR type variables
- **Local Targets**: Can only create variables in local collections
- **Opacity Format**: Must use `--alpha(var(--color) / X%)` syntax

## Troubleshooting

### Variables Not Found

- Check exact naming in source collection
- Verify the plugin's variable name conversion logic
- Use console logs to see what names are being searched

### Import Failures

- Ensure you have access to the library
- Check library publishing status
- Verify variable keys haven't changed

### Performance Issues

- Large files are handled with async batching
- Console logs are collapsed by default
- UI uses accordions to manage long lists

## Future Enhancements

- Support for additional variable types (spacing, typography)
- Export functionality for created mappings
- Batch processing of multiple CSS files
- Variable validation and preview
- Undo/redo functionality

## Version History

- **1.0.0**: Initial release with core functionality
- **1.1.0**: Added console grouping and UI improvements
- **1.2.0**: Fixed async handling and button positioning
