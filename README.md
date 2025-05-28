# Theme Variables Mapper

A Figma plugin that maps CSS @theme variables to Figma variables using **local collection references**.

## Overview

This plugin allows you to:

1. Parse CSS files containing @theme variables with light/dark mode definitions
2. Map those variables to existing variables in either a **local collection** or an **external library collection**
3. Create new variables in a target collection that reference the source variables

## Key Features

- **Flexible Source Mapping**: Maps variables from either local collections or external library collections
- **Local Target Collections**: Creates new variables in local collections within your file
- **Light/Dark Mode Support**: Automatically handles light and dark mode variable mappings
- **ES5 Compatible**: Fully compatible with Figma's plugin environment
- **CSS @theme Parsing**: Extracts variable definitions from CSS @theme blocks

## How It Works

### 1. CSS Structure Expected

The plugin expects CSS with this structure:

```css
@theme {
  --color-primary: var(--color-blue-500);
  --color-secondary: var(--color-gray-500);
}

:root,
.light {
  --color-blue-500: var(--color-blue-75);
  --color-gray-500: var(--color-gray-75);
}

.dark {
  --color-blue-500: var(--color-blue-25);
  --color-gray-500: var(--color-gray-25);
}
```

### 2. Variable Mapping Process

1. **Upload CSS**: Upload a CSS file containing @theme variables
2. **Select Source Collection**: Choose which collection contains the base color variables:
   - **Local Collections**: Collections within your current Figma file
   - **Library Collections**: External shared library collections
3. **Choose Target**: Either create a new local collection or use an existing local collection for the theme variables
4. **Apply**: The plugin creates variables like `color/primary` that reference the appropriate source variables

### 3. Result

You'll get theme variables that automatically switch between light and dark modes by referencing different source variables:

- `color/primary` (Light mode) → references `color/blue/75`
- `color/primary` (Dark mode) → references `color/blue/25`

## Usage

1. **Prepare Your Collections**: Ensure you have either:
   - A local collection with your base color variables, OR
   - Access to a shared library with the required color variables
2. **Run the Plugin**: Open the Theme Variables Mapper plugin in Figma
3. **Upload CSS**: Select your CSS file with @theme definitions
4. **Configure Mapping**:
   - Select the source collection (local or library) containing your base colors
   - Choose to create a new target collection or use an existing local collection
5. **Apply Changes**: Review the preview and apply the variable creation

## Variable Naming Conventions

- **CSS Variables**: Use hyphens with `--` prefix (e.g., `--color-red-500`)
- **Figma Variables**: Use forward slashes (e.g., `color/red/500`)
- **Conversion**: The plugin automatically converts between these formats

## Requirements

- Figma desktop app or web app
- Either local variable collections OR access to shared library collections with base color variables
- CSS file with @theme variable definitions

## Technical Details

- **ES5 Compatible**: Uses only ES5 JavaScript features for maximum compatibility
- **Flexible Source Support**: Works with both local collections and external library collections
- **Local Target Collections**: Always creates variables in local collections (targets cannot be library collections)
- **Alias Creation**: Creates proper variable aliases that maintain relationships
- **Library Import**: Automatically imports library variables when needed for referencing

## Troubleshooting

### Common Issues

1. **Variables Not Found**: Ensure your source collection contains variables with the exact names expected by the CSS
2. **Mode Mismatch**: The plugin expects "Light" and "Dark" modes in collections
3. **CSS Format**: Verify your CSS follows the expected @theme structure

### Debug Information

The plugin provides detailed console logging to help debug variable matching issues. Check the browser console for detailed information about:

- Variable discovery in source collections
- CSS parsing results
- Variable creation success/failure

## Changes from Original

This version has been modified to:

- Support both local collections AND external library collections as sources
- Always use local collections as targets (for variable creation)
- Support flexible source-to-local variable mapping
- Maintain full ES5 compatibility
- Provide clearer UI for collection selection with library/local indicators

## Development

The plugin consists of:

- `code.js`: Main plugin logic (ES5 compatible)
- `ui.html`: Plugin interface with inline CSS and JavaScript
- `manifest.json`: Plugin configuration
- `check-es5.js`: ES5 compatibility checker
