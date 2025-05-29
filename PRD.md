# Theme Variables Mapper Plugin - Product Requirements Document

## Overview

A Figma plugin that automates the creation of theme variables by parsing CSS files containing `@theme` declarations and creating aliases to existing design tokens in Figma libraries or local collections. The plugin supports light/dark mode theming, handles complex opacity syntax, and provides sentiment-based variable lifecycle management.

## Problem Statement

Design teams managing large design systems need to map hundreds of theme variables to their corresponding design tokens across light and dark modes. Manual creation of these aliases is time-consuming, error-prone, and difficult to maintain as design systems evolve. Additionally, keeping theme-specific variables in sync with CSS definitions requires careful management of variable lifecycles.

## Solution

An automated plugin that:

1. **Parses CSS Files**: Extracts theme variable definitions from CSS `@theme` blocks
2. **Maps Variable References**: Connects theme variables to their light/dark mode source variables
3. **Creates Aliases**: Automatically creates Figma variable aliases with proper mode configurations
4. **Manages Variable Lifecycle**: In Replace mode, removes orphaned variables based on sentiment detection
5. **Handles Large Collections**: Optimizes performance with optional JSON imports for 500+ variable collections
6. **Reports Results**: Provides detailed feedback on created, updated, removed, and failed variables

## Core Features

### 1. Collection Management

#### Source Collections

- Support for both library (external) and local collections
- Automatic discovery and loading of available collections
- Display of collection metadata (variable count, modes, library name)
- Smart default selection (first library collection)

#### Target Collections

- Local collections only (Figma API limitation)
- Automatic Light/Dark mode setup
- Support for existing collections or new collection creation

### 2. CSS Parsing

#### Required CSS Structure

```css
/* Theme variable definitions */
@theme {
  --color-fill-danger: var(--fill-danger);
  --color-stroke-danger: var(--stroke-danger);
}

/* Light mode values */
:root,
.light {
  --fill-danger: var(--color-red-75);
  --stroke-danger: --alpha(var(--color-red-400) / 40%);
}

/* Dark mode values */
.dark {
  --fill-danger: --alpha(var(--color-red-500) / 15%);
  --stroke-danger: --alpha(var(--color-red-400) / 50%);
}
```

#### Parsing Features

- **Name Conversion**: CSS hyphens to Figma slashes (`--color-red-500` → `color/red/500`)
- **Opacity Handling**: `--alpha(var(--color) / X%)` → `color/name_XX` format
- **Special Cases**:
  - 100% opacity: drops suffix (`color/red/500_100` → `color/red/500`)
  - Stepless colors: `black` and `white` without numeric steps
  - Zero-padding: `5%` → `_05`, `90%` → `_90`

### 3. Sentiment-Based Variable Management

#### Sentiment Detection

Sentiment is detected from the CSS filename and must be one of:

- `danger.css`
- `warning.css`
- `success.css`
- `info.css`
- `brand.css`
- `neutral.css`

#### Variable Lifecycle Management

When a CSS file is uploaded with a detected sentiment (e.g., "danger"):

1. **Filter Phase**: Identify ALL variables in the target collection containing the sentiment word ANYWHERE in their name

   - Matches `color/fill/danger`
   - Matches `color/fill/danger/normal/default`
   - Matches `color/danger/emphasis`
   - Matches `color/a11y/danger/normal/visited`
   - Case-insensitive matching

2. **Process Phase**: For each variable defined in the CSS:

   - If it exists in Figma → **UPDATE** with new references
   - If it doesn't exist → **CREATE** new variable

3. **Cleanup Phase** (Replace Mode Only): For sentiment-related variables in Figma:
   - If NOT defined in CSS → **REMOVE** from collection
   - Non-sentiment variables are never touched

#### Mode Options

- **Replace Mode (Recommended)**: Keeps variables in sync with CSS by creating, updating, AND removing
- **Merge Mode**: Only creates and updates, never removes existing variables

#### Example Workflow

**Initial State**: Target collection has 75 variables, 10 contain "danger"

```
color/fill/danger (old format)
color/fill/danger/emphasis (old format)
color/stroke/danger
... 7 more danger variables
... 65 non-danger variables
```

**Upload danger.css**: Defines 26 danger variables

```
color/fill/danger/normal/default
color/fill/danger/emphasis/default
... 24 more
```

**Result in Replace Mode**:

- ✅ Created: 23 new variables
- 🔄 Updated: 3 existing variables
- 🗑️ Removed: 7 orphaned danger variables
- Unchanged: 65 non-danger variables (not reported)

### 4. Performance Optimization

#### Large Collection Detection

- Automatically detects collections with 500+ variables
- Prompts for JSON upload to optimize performance
- Supports bulk processing with progress tracking

#### JSON Import Feature

```javascript
// JSON format from Figma variable export
{
  "color/red/500": {
    "key": "VariableID:1234/5678",
    "name": "color/red/500",
    // ... other properties
  }
}
```

### 5. Variable Creation Process

#### Mode Management

- Automatically ensures Light and Dark modes exist in target collection
- Renames default mode to "Light" if only one mode exists
- Adds "Dark" mode if not present
- Case-insensitive mode detection

#### Alias Creation

- Creates theme variables as aliases to source variables
- Maintains proper light/dark mode references
- Handles library variable imports asynchronously
- Updates existing variables or creates new ones

## User Interface

### Collection Selection Screen

- Displays all available collections with metadata
- Separate dropdowns for source and target selection
- Visual indicators for library vs local collections
- Refresh button to reload collections

### CSS Upload Screen

- Drag & drop interface for CSS files
- Sentiment indicator showing detected theme type
- Clear indication of selected collections
- Support for `.css` file validation

### JSON Upload Screen (Conditional)

- Appears for collections with 500+ variables
- Optional optimization step
- Skip button for standard processing

### Preview Screen

- Shows all variables to be created/updated
- Mode toggle (Replace/Merge) when sentiment is detected
- Removal warning showing count of variables to be removed
- Displays light/dark mode mappings
- Collapsible sections for better overview
- Apply/Cancel actions

### Results Screen

- Summary cards showing counts for:
  - ✅ Created variables
  - 🔄 Updated variables
  - 🗑️ Removed variables
  - ⚠️ Failed variables
- Detailed collapsible lists for each category
- Clear error messages for failures
- No display of ignored/unchanged variables

## Technical Architecture

### ES5 Compatibility Requirements

**CRITICAL**: All code must be ES5-compatible for Figma's plugin environment

#### ✅ Required Patterns

```javascript
// Function declarations
function processVariables() {}

// String concatenation
var message = "Processing " + count + " variables";

// Traditional loops
for (var i = 0; i < array.length; i++) {
  var item = array[i];
}

// var declarations only
var config = { mode: "light" };
```

#### ❌ Forbidden Syntax

- Arrow functions: `() => {}`
- Template literals: `` `${var}` ``
- const/let declarations
- Destructuring: `{a, b} = obj`
- for...of loops
- Spread operator: `...array`
- Browser-specific console methods: `console.groupCollapsed()`, `console.groupEnd()`

### Core Functions

#### `loadCollections()`

- Loads local collections synchronously
- Loads library collections asynchronously
- Handles import of library variables for inspection
- Sends formatted collection data to UI

#### `parseCSSContent(cssContent, filename)`

- Validates CSS structure
- Detects sentiment from filename
- Extracts `@theme` block mappings
- Parses light/dark mode values
- Converts names to Figma format
- Returns structured variable mappings with sentiment

#### `findOrphanedSentimentVariables(existingVariables, cssVariables, sentiment)`

- Identifies all variables containing the sentiment word
- Compares against CSS-defined variables
- Returns list of variables to remove
- Case-insensitive sentiment matching

#### `createVariablesFromCSS(...)`

- Main orchestrator for variable creation
- Routes to appropriate processor (library/local)
- Manages collection mode setup
- Handles variable removal in Replace mode
- Handles JSON data if provided

#### `processLibraryVariables(...)`

- Imports library variables by key
- Creates aliases asynchronously
- Uses Promise.all for bulk operations
- Tracks success/failure for each variable

### Console Logging Strategy

```javascript
console.log("📚 Loading collections...");
console.log("⚡ Processing 75 variables...");
console.log("🔄 Processing: color/fill/danger");
console.log("✅ Created: color/fill/danger");
console.log("📊 === FINAL RESULTS ===");
```

Note: Avoid `console.groupCollapsed()` and `console.groupEnd()` as they're not supported in Figma's environment.

## API Integration

### Variable Import Process

```javascript
// Import library variable by key
figma.variables.importVariableByKeyAsync(variableKey).then(function (imported) {
  // Create alias to imported variable
  var alias = figma.variables.createVariableAlias(imported);
  targetVariable.setValueForMode(lightModeId, alias);
});
```

### Collection Mode Setup

```javascript
// Ensure Light/Dark modes exist
if (collection.modes.length === 1) {
  collection.renameMode(defaultModeId, "Light");
  var darkModeId = collection.addMode("Dark");
}
```

### Variable Removal

```javascript
// Remove orphaned variables in Replace mode
if (detectedSentiment && selectedMode === "replace") {
  var orphaned = findOrphanedSentimentVariables(existing, cssVars, sentiment);
  for (var i = 0; i < orphaned.length; i++) {
    orphaned[i].variable.remove();
  }
}
```

## Success Metrics

- ✅ Parse CSS files with `@theme`, light, and dark mode blocks
- ✅ Handle 75+ variables efficiently with async processing
- ✅ Support opacity syntax with proper Figma naming conversion
- ✅ Create proper light/dark mode aliases
- ✅ Manage variable lifecycle based on sentiment detection
- ✅ Remove orphaned sentiment-specific variables in Replace mode
- ✅ Provide clear success/failure reporting
- ✅ Optimize performance for large collections (500+ variables)
- ✅ Maintain ES5 compatibility throughout

## Error Handling

### CSS Parsing Errors

- Invalid CSS format detection
- Missing required blocks (@theme, light, dark)
- Invalid filename for sentiment detection
- Clear error messages with guidance

### Variable Creation Errors

- Source variable not found (exact match required)
- Permission issues with target collection
- Library access problems
- Detailed per-variable error reporting

### UI Error States

- File upload validation
- Collection selection validation
- Network/async operation failures
- User-friendly error messages

## Future Enhancements

1. **Batch Operations**: Process multiple CSS files
2. **Export Functionality**: Export created mappings
3. **Variable Validation**: Pre-flight checks before creation
4. **Undo Support**: Rollback capability
5. **Additional Variable Types**: Support for spacing, typography variables
6. **Custom Naming Patterns**: Configurable name transformations
7. **Sentiment Pattern Configuration**: Allow custom sentiment matching rules

---

**Document Version**: 4.0  
**Status**: Implementation with minor fixes needed  
**Compatibility**: Figma Plugin API 1.0.0, ES5 JavaScript
