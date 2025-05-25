# Theme Variables Mapper

## Background Context

This plugin was created to bridge the gap between CSS theme variables and Figma's variable system. It enables designers and developers to maintain consistency between their codebase and design system by automatically converting CSS theme variables into Figma variables with proper library references.

## The Problem

Design systems often maintain theme variables in CSS (like Tailwind CSS) that need to be reflected in Figma. Manually creating and maintaining these variables in Figma is:

- Time-consuming and error-prone
- Difficult to keep in sync with code
- Challenging to maintain proper library references
- Complex when dealing with multiple themes (light/dark modes)

## Technical Constraints

**⚠️ Important: Figma Plugin JavaScript Environment Limitations**

Figma's plugin environment has limited JavaScript support and does **NOT** support many ES6+ features:

- ❌ **Template literals**: `` `${variable}` `` → Use `"string" + variable`
- ❌ **Spread operator**: `{...object}` → Use `Object.assign({}, object, newProps)`
- ❌ **Arrow functions in some contexts** → Use `function() {}`
- ❌ **Destructuring assignments** → Use explicit property access
- ❌ **Modern array methods** (in some cases) → Test thoroughly

**✅ Supported JavaScript:**

- Standard function declarations
- String concatenation with `+`
- `Object.assign()` for object merging
- Traditional for loops and basic array methods
- Standard object and array syntax

## Plugin Purpose

This tool automates the process of creating and managing Figma variables by:

### Converting CSS Variables to Figma Variables

- Transforms CSS variable names (e.g., `--color-red-500`) to Figma format (`color/red/500`)
- Maintains proper naming conventions and hierarchy
- Supports multiple theme modes (light/dark)

### Managing Library References

- Creates variables in local or library collections
- Establishes proper cross-collection references
- Maintains variable relationships and aliases

### Supporting Variable Types

- Colors (hex, rgb, rgba)
- Numbers (for spacing, sizing)
- Strings (for text values)
- Complex values (gradients, etc.)

## How to Use

### Setup Required

1. Prepare your CSS file containing theme variables:

   ```css
   @theme {
     --color-red-500: #ef4444;
     --spacing-4: 1rem;
     /* ... more variables ... */
   }
   ```

2. Have your Figma library ready:
   - Create or select a library collection
   - Ensure you have proper permissions

### Plugin Workflow

1. **Launch Plugin**: Open the Theme Variable Mapper in Figma
2. **Upload CSS**: Paste your CSS content or upload the file
3. **Select Target**: Choose where to create the variables:
   - New local collection
   - Existing local collection
   - Library collection
4. **Create Variables**: Review and confirm the variable creation
5. **Verify Results**: Check the created variables and their references

### Expected Output

```
=== VARIABLE CREATION SUMMARY ===
Total Variables Processed: X
✅ Created: X variables
🔄 Updated: X variables
❌ Failed: X variables

=== VARIABLE TYPES ===
🎨 Colors: X
📏 Numbers: X
📝 Strings: X
🔗 References: X
```

## Files Structure

- `manifest.json` - Plugin configuration and permissions
- `code.js` - Core variable mapping and creation logic
- `ui.html` - User interface for CSS input and variable management
- `README.md` - This documentation

## Success Criteria

- ✅ Accurate conversion of CSS variables to Figma format
- ✅ Proper creation of cross-collection references
- ✅ Support for multiple theme modes
- ✅ Maintainable and scalable variable structure
- ✅ Clear error handling and user feedback

## Next Steps

Future improvements could include:

- Support for more CSS variable formats
- Batch processing of multiple CSS files
- Variable value validation and type checking
- Export functionality for existing Figma variables
- Integration with design token systems
