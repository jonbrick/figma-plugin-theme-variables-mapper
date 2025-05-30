# Theme Variables Mapper - Figma Plugin

A Figma plugin that automates the creation of theme variables by parsing CSS files and mapping them to existing design tokens in your Figma libraries or local collections. Perfect for maintaining consistency between CSS-based design systems and Figma implementations.

## 🚀 Quick Start

1. Install the plugin in Figma
2. Select your source collection (where your design tokens live)
3. Select your target collection (where theme variables will be created)
4. Upload your CSS file with `@theme` definitions
5. Review and apply the mappings

## ✨ Features

- **🎨 CSS @theme Parsing**: Automatically extracts theme variables from CSS files
- **🌓 Light/Dark Mode Support**: Creates proper mode-specific aliases
- **📚 Library Support**: Reference variables from external libraries or local collections
- **⚡ Performance Optimized**: Handles 500+ variables with optional JSON import
- **🔍 Smart Validation**: Comprehensive error checking and reporting
- **📊 Detailed Results**: Clear feedback on created, updated, removed, and failed variables
- **🔄 Variable Lifecycle Management**: Replace mode removes orphaned variables

## 📋 CSS Format Requirements

Your CSS file must follow this structure:

```css
/* 1. Theme variable definitions */
@theme {
  --color-primary: var(--primary);
  --color-danger: var(--fill-danger);
  --color-warning: var(--fill-warning);
}

/* 2. Light mode values */
:root,
.light {
  --primary: var(--color-blue-500);
  --fill-danger: var(--color-red-75);
  --fill-warning: --alpha(var(--color-yellow-600) / 80%);
}

/* 3. Dark mode values */
.dark {
  --primary: var(--color-blue-400);
  --fill-danger: --alpha(var(--color-red-500) / 15%);
  --fill-warning: --alpha(var(--color-yellow-400) / 90%);
}
```

### Supported Syntax

#### Basic Variable References

```css
var(--color-red-500)    → color/red/500
var(--color-black)      → color/black
```

#### Opacity Syntax

```css
--alpha(var(--color-red-700) / 90%)   → color/red/700_90
--alpha(var(--color-red-500) / 5%)    → color/red/500_05
--alpha(var(--color-black) / 25%)     → color/black_25
```

#### Special Cases

- **100% opacity**: Drops the suffix → `color/red/500_100` becomes `color/red/500`
- **Zero padding**: `5%` → `_05`, `15%` → `_15`
- **Stepless colors**: `black` and `white` don't use numeric steps

## 🔧 How It Works

### Step 1: Collection Selection

Choose your source collection (containing design tokens) and target collection (where theme variables will be created).

### Step 2: CSS Upload

Upload your CSS file containing `@theme` definitions and mode-specific values. The filename should indicate the sentiment (e.g., `danger.css`, `warning.css`).

### Step 3: Performance Optimization (Optional)

For collections with 500+ variables, you can upload a JSON export for faster processing:

1. In Figma, select your variables collection
2. Use the plugin's variable extractor to export as JSON
3. Upload the JSON file when prompted

### Step 4: Preview & Apply

Review the variables to be created and their mappings, then apply to create aliases in your target collection.

## 🏗️ Technical Details

### Variable Naming Convention

| CSS Format                         | Figma Format       |
| ---------------------------------- | ------------------ |
| `--color-red-500`                  | `color/red/500`    |
| `--fill-danger`                    | `fill/danger`      |
| `--color-primary`                  | `color/primary`    |
| `--color-red-500` with 90% opacity | `color/red/500_90` |

### Mode Management

The plugin automatically:

- Detects existing Light/Dark modes in your target collection
- Creates missing modes if needed
- Handles case-insensitive mode names ("Light", "light", "LIGHT")
- Renames default mode to "Light" if only one mode exists

### Sentiment-Based Variable Management

For files with sentiment detection (danger.css, warning.css, etc.):

#### Replace Mode (Recommended)

- **Creates**: New variables from CSS
- **Updates**: Existing variables with new references
- **Removes**: Orphaned sentiment variables not in CSS
- **Preserves**: All non-sentiment variables

#### Merge Mode

- **Creates**: New variables from CSS
- **Updates**: Existing variables with new references
- **Never removes**: Keeps all existing variables

## 📦 Results Screen

The plugin always shows results with four categories:

- **✅ Created**: New variables created
- **🔄 Updated**: Existing variables updated
- **🗑️ Removed**: Variables removed (Replace mode only)
- **⚠️ Failed**: Missing source variables

All categories display even if empty (showing "0 created", etc.) with collapsible accordions for detailed viewing.

## 🐛 Understanding Failed Imports

Failed imports are common and expected when:

- Your CSS references opacity variants not in your source library (e.g., `color/red/100_90`)
- The plugin will mark these as "failed" but continue processing
- Solution: Add missing variants to your source collection or update CSS to use existing variants

### Example

```
CSS requests: --alpha(var(--color-red-100) / 90%)
Converts to: color/red/100_90
If this variant doesn't exist in source → Failed import (expected behavior)
```

## 📂 Plugin Structure

```
theme-variables-mapper/
├── manifest.json      # Plugin configuration
├── code.js           # Main plugin logic (ES5)
├── ui.html           # Plugin UI with inline styles/scripts
├── check-es5.js      # ES5 compatibility checker
├── PRD.md            # Product requirements document
└── README.md         # This file
```

### ES5 Compatibility

This plugin is written in ES5 JavaScript for Figma compatibility:

- ✅ Traditional functions: `function() {}`
- ✅ String concatenation: `"text " + variable`
- ✅ var declarations: `var name = value`
- ❌ No arrow functions, template literals, const/let, or destructuring
- ❌ No console.groupCollapsed() or console.groupEnd()

## 🚦 Console Output

The plugin uses organized console logging:

```
📚 Loading collections...
✅ Found 2 library collections
📄 Parsing CSS content...
✅ Found 75 theme variables
🚀 Processing 75 variables...
📊 === FINAL RESULTS ===
✅ Created: 0
🔄 Updated: 6
🗑️ Removed: 5
❌ Failed: 20
```

## ❗ Troubleshooting

### "Variable not found" errors

- Ensure variable names match exactly (case-sensitive)
- Check that opacity values use the correct format (`_05`, `_90`)
- Verify the source collection contains all referenced variables
- Failed imports are expected for non-existent opacity variants

### Performance issues

- For 500+ variables, use the JSON import option
- Check console logs for detailed processing information
- Ensure stable internet connection for library imports

### CSS parsing errors

- Verify all three blocks exist: `@theme`, light mode, dark mode
- Check for syntax errors in variable references
- Ensure opacity syntax follows the `--alpha()` format
- Filename must be one of: danger.css, warning.css, success.css, info.css, brand.css, neutral.css

### Results not showing

- The plugin shows results even with failed imports
- Check that all result accordions are present in the UI
- Verify the message handler shows results for any non-empty results

## 🔮 Future Enhancements

- Support for additional variable types (spacing, typography)
- Batch processing of multiple CSS files
- Export functionality for created mappings
- Undo/redo support
- Custom naming pattern configuration
- Configurable console log verbosity

## 📄 License

This plugin is provided as-is for use with Figma's design system workflows.

## 🤝 Contributing

For bug reports or feature requests, please document:

1. Your CSS file structure
2. Collection setup (source/target)
3. Console error messages
4. Expected vs actual behavior

---

**Version**: 2.0.0  
**Compatibility**: Figma Plugin API 1.0.0  
**Requirements**: ES5 JavaScript environment
