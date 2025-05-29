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
- **📊 Detailed Results**: Clear feedback on created, updated, and failed variables

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

Upload your CSS file containing `@theme` definitions and mode-specific values.

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

### Error Handling

The plugin provides detailed error reporting for:

- **Missing source variables**: When a referenced variable doesn't exist
- **CSS parsing errors**: Invalid format or missing required blocks
- **Permission issues**: Can't create variables in the target collection
- **Import failures**: Library access problems

## 📦 Plugin Structure

```
theme-variables-mapper/
├── manifest.json      # Plugin configuration
├── code.js           # Main plugin logic (ES5)
├── ui.html           # Plugin UI with inline styles/scripts
├── check-es5.js      # ES5 compatibility checker
└── README.md         # This file
```

### ES5 Compatibility

This plugin is written in ES5 JavaScript for Figma compatibility:

- ✅ Traditional functions: `function() {}`
- ✅ String concatenation: `"text " + variable`
- ✅ var declarations: `var name = value`
- ❌ No arrow functions, template literals, const/let, or destructuring

## 🐛 Troubleshooting

### "Variable not found" errors

- Ensure variable names match exactly (case-sensitive)
- Check that opacity values use the correct format (`_05`, `_90`)
- Verify the source collection contains all referenced variables

### Performance issues

- For 500+ variables, use the JSON import option
- Check console logs for detailed processing information
- Ensure stable internet connection for library imports

### CSS parsing errors

- Verify all three blocks exist: `@theme`, light mode, dark mode
- Check for syntax errors in variable references
- Ensure opacity syntax follows the `--alpha()` format

## 🚦 Console Output

The plugin uses organized console logging:

```
📚 Loading collections...
✅ Found 2 library collections
📄 Parsing CSS content...
✅ Found 75 theme variables
▼ ⚡ Processing 75 variables...    [Click to expand]
📊 === FINAL RESULTS ===
✅ Created: 70
🔄 Updated: 5
❌ Failed: 0
```

## 🔮 Future Enhancements

- Support for additional variable types (spacing, typography)
- Batch processing of multiple CSS files
- Export functionality for created mappings
- Undo/redo support
- Custom naming pattern configuration

## 📄 License

This plugin is provided as-is for use with Figma's design system workflows.

## 🤝 Contributing

For bug reports or feature requests, please document:

1. Your CSS file structure
2. Collection setup (source/target)
3. Console error messages
4. Expected vs actual behavior

---

**Version**: 1.2.0  
**Compatibility**: Figma Plugin API 1.0.0  
**Requirements**: ES5 JavaScript environment
