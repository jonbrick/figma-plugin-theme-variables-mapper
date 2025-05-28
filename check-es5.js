#!/usr/bin/env node

/**
 * ES5 Compatibility Checker for Figma Plugins
 *
 * This script scans JavaScript files for ES6+ syntax that would break
 * in Figma's plugin environment.
 *
 * Usage: node check-es5.js
 */

const fs = require("fs");
const path = require("path");

// Files to check
const filesToCheck = ["code.js", "ui.html"];

// ES6+ patterns that are forbidden in Figma plugins
const forbiddenPatterns = [
  {
    pattern: /`[^`]*\$\{[^}]*\}[^`]*`/g,
    name: "Template Literals",
    description: 'Use string concatenation instead: "Hello " + name + "!"',
  },
  {
    pattern: /=>\s*{|=>\s*[^{]/g,
    name: "Arrow Functions",
    description: "Use function() syntax instead",
  },
  {
    pattern: /const\s+\{[^}]+\}\s*=/g,
    name: "Object Destructuring",
    description: "Use explicit property access: var name = obj.name;",
  },
  {
    pattern: /const\s+\[[^\]]+\]\s*=/g,
    name: "Array Destructuring",
    description: "Use explicit indexing: var first = arr[0];",
  },
  {
    pattern: /let\s+\{[^}]+\}\s*=/g,
    name: "Object Destructuring (let)",
    description: "Use explicit property access: var name = obj.name;",
  },
  {
    pattern: /let\s+\[[^\]]+\]\s*=/g,
    name: "Array Destructuring (let)",
    description: "Use explicit indexing: var first = arr[0];",
  },
  {
    pattern: /\.\.\.[a-zA-Z_$][a-zA-Z0-9_$]*/g,
    name: "Spread Operator",
    description: "Use Object.assign() or array.concat() instead",
  },
  {
    pattern: /function\s+[a-zA-Z_$][a-zA-Z0-9_$]*\s*\([^)]*=[^)]*\)/g,
    name: "Default Parameters",
    description: "Handle defaults manually: param = param || defaultValue;",
  },
  {
    pattern: /[a-zA-Z_$][a-zA-Z0-9_$]*\s*\([^)]*\)\s*\{/g,
    name: "Object Method Shorthand",
    description: "Use method: function() syntax instead",
    // This is a loose pattern - may have false positives
    skipCheck: true,
  },
  {
    pattern: /for\s*\(\s*(const|let)\s+[^}]+of\s+/g,
    name: "For...of Loops",
    description: "Use traditional for loops instead",
  },
];

// Warning patterns (potentially problematic)
const warningPatterns = [
  {
    pattern: /\bconst\s+/g,
    name: "const declarations",
    description: "Consider using var for broader compatibility",
  },
  {
    pattern: /\blet\s+/g,
    name: "let declarations",
    description: "Consider using var for broader compatibility",
  },
];

function checkFile(filePath) {
  console.log(`\n🔍 Checking ${filePath}...`);

  if (!fs.existsSync(filePath)) {
    console.log(`   ⚠️  File not found: ${filePath}`);
    return { errors: 0, warnings: 0 };
  }

  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");

  let errorCount = 0;
  let warningCount = 0;

  // Check for forbidden patterns
  forbiddenPatterns.forEach(({ pattern, name, description, skipCheck }) => {
    if (skipCheck) return;

    let match;
    while ((match = pattern.exec(content)) !== null) {
      const lineNumber = content.substring(0, match.index).split("\n").length;
      const lineContent = lines[lineNumber - 1].trim();

      console.log(`   ❌ ${name} found at line ${lineNumber}:`);
      console.log(`      "${lineContent}"`);
      console.log(`      💡 ${description}`);
      errorCount++;
    }
  });

  // Check for warning patterns
  warningPatterns.forEach(({ pattern, name, description }) => {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const lineNumber = content.substring(0, match.index).split("\n").length;
      const lineContent = lines[lineNumber - 1].trim();

      console.log(`   ⚠️  ${name} found at line ${lineNumber}:`);
      console.log(`      "${lineContent}"`);
      console.log(`      💡 ${description}`);
      warningCount++;
    }
  });

  if (errorCount === 0 && warningCount === 0) {
    console.log(`   ✅ No ES6+ syntax detected`);
  }

  return { errors: errorCount, warnings: warningCount };
}

function main() {
  console.log("🚀 ES5 Compatibility Checker for Figma Plugins");
  console.log("================================================");

  let totalErrors = 0;
  let totalWarnings = 0;

  filesToCheck.forEach((file) => {
    const result = checkFile(file);
    totalErrors += result.errors;
    totalWarnings += result.warnings;
  });

  console.log("\n📊 Summary:");
  console.log(`   Errors: ${totalErrors}`);
  console.log(`   Warnings: ${totalWarnings}`);

  if (totalErrors > 0) {
    console.log("\n❌ ES6+ syntax detected! Plugin may fail in Figma.");
    console.log("   Please fix the errors above before deploying.");
    process.exit(1);
  } else if (totalWarnings > 0) {
    console.log("\n⚠️  Potential compatibility issues detected.");
    console.log("   Consider addressing warnings for better compatibility.");
  } else {
    console.log("\n✅ All files appear to be ES5 compatible!");
  }
}

if (require.main === module) {
  main();
}

module.exports = { checkFile, forbiddenPatterns, warningPatterns };
