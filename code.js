// Figma Theme Variable Mapper - Maps CSS @theme variables to Figma variables with shared library references
//
// IMPORTANT NAMING CONVENTIONS:
// - Figma variables use forward slashes: color/red/500
// - CSS/Tailwind variables use hyphens with -- prefix: --color-red-500
// - This plugin converts between these two naming conventions

console.log("🚀 Plugin started");

figma.showUI(__html__, {
  width: 400,
  height: 700,
  title: "Theme Variables Mapper",
  themeColors: true,
});

console.log("✅ UI shown");

// Load libraries immediately when plugin starts
handleGetCollections();

figma.ui.onmessage = async (msg) => {
  switch (msg.type) {
    case "parse-css":
      await handleCSSParsing(msg.cssContent);
      break;
    case "get-collections":
      await handleGetCollections();
      break;
    case "create-variables":
      await handleVariableCreation(
        msg.variablesToCreate,
        msg.selectedLibraryId,
        msg.collectionChoice,
        msg.existingCollectionId
      );
      break;
    case "close-plugin":
      figma.closePlugin();
      break;
    default:
      console.error("Unknown message type:", msg.type);
  }
};

async function handleGetCollections() {
  try {
    console.log("📚 Loading libraries...");

    const libraryCollections =
      await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
    const localCollections = figma.variables.getLocalVariableCollections();

    // Group collections by library
    const libraryInfo = new Map();

    for (const collection of libraryCollections) {
      try {
        const variables =
          await figma.teamLibrary.getVariablesInLibraryCollectionAsync(
            collection.key
          );

        const libraryName = collection.libraryName || collection.name;
        if (!libraryInfo.has(libraryName)) {
          libraryInfo.set(libraryName, {
            libraryName: libraryName,
            collections: [],
            totalVariables: 0,
          });
        }

        const library = libraryInfo.get(libraryName);
        library.collections.push({
          id: collection.key,
          name: collection.name,
          variableCount: variables.length,
        });
        library.totalVariables += variables.length;
      } catch (error) {
        const libraryName = collection.libraryName || collection.name;
        if (!libraryInfo.has(libraryName)) {
          libraryInfo.set(libraryName, {
            libraryName: libraryName,
            collections: [],
            totalVariables: 0,
          });
        }

        const library = libraryInfo.get(libraryName);
        library.collections.push({
          id: collection.key,
          name: collection.name,
          variableCount: 0,
          error: error.message,
        });
      }
    }

    const libraries = Array.from(libraryInfo.values()).sort((a, b) =>
      a.libraryName.localeCompare(b.libraryName)
    );

    console.log(
      `✅ Found ${libraries.length} libraries with ${libraryCollections.length} collections`
    );

    figma.ui.postMessage({
      type: "collections-loaded",
      success: true,
      libraries: libraries,
      localCollections: localCollections.map((collection) => ({
        id: collection.id,
        name: collection.name,
        modeCount: collection.modes.length,
      })),
    });
  } catch (error) {
    console.error("❌ Error loading libraries:", error.message);
    figma.ui.postMessage({
      type: "collections-loaded",
      success: false,
      message: `Error loading libraries: ${error.message}`,
    });
  }
}

async function handleCSSParsing(cssContent) {
  try {
    console.log("📄 CSS uploaded - parsing variables...");

    // Validate that we received actual CSS content, not HTML
    if (!cssContent || typeof cssContent !== "string") {
      throw new Error("Invalid CSS content received");
    }

    if (cssContent.trim().startsWith("<")) {
      throw new Error("HTML content detected instead of CSS");
    }

    const themeVariables = extractThemeVariables(cssContent);

    if (themeVariables.length === 0) {
      console.log("❌ No @theme variables found");
      figma.ui.postMessage({
        type: "parsing-complete",
        success: false,
        message: "No @theme variables found in the CSS file.",
      });
      return;
    }

    console.log(
      `✅ Found ${themeVariables.length} theme variables with light/dark modes`
    );

    figma.ui.postMessage({
      type: "parsing-complete",
      success: true,
      results: {
        variables: themeVariables,
        totalFound: themeVariables.length,
      },
    });
  } catch (error) {
    console.error("❌ CSS parsing failed:", error.message);
    figma.ui.postMessage({
      type: "parsing-complete",
      success: false,
      message: `Error parsing CSS: ${error.message}`,
    });
  }
}

async function handleVariableCreation(
  variablesToCreate,
  selectedLibraryId,
  collectionChoice,
  existingCollectionId
) {
  try {
    console.log("🚀 Starting variable creation...");

    const created = [];
    const updated = [];
    const failed = [];

    // Get library variables
    const libraryVariables =
      await figma.teamLibrary.getVariablesInLibraryCollectionAsync(
        selectedLibraryId
      );
    console.log(
      `📊 Found ${libraryVariables.length} variables in selected library`
    );

    // Create map of library variables
    const libraryVariableMap = new Map();
    for (const variable of libraryVariables) {
      libraryVariableMap.set(variable.name, variable);
    }

    // Show ALL variable names so we can see the actual format
    const allKeys = Array.from(libraryVariableMap.keys()).sort();
    console.log(`📋 First 20 library variables:`, allKeys.slice(0, 20));
    console.log(
      `📋 Variables containing "red":`,
      allKeys.filter((name) => name.includes("red")).slice(0, 10)
    );
    console.log(
      `📋 Variables containing "75":`,
      allKeys.filter((name) => name.includes("75")).slice(0, 10)
    );

    // Get or create collection based on user choice
    let collection;
    if (collectionChoice === "new") {
      collection = figma.variables.createVariableCollection("Theme Variables");
    } else {
      collection =
        figma.variables.getVariableCollectionById(existingCollectionId);
      if (!collection) {
        throw new Error("Selected collection not found");
      }
    }

    // Ensure we have light and dark modes
    let lightModeId = collection.defaultModeId;
    let darkModeId = null;

    const modes = collection.modes;
    if (modes.length === 1) {
      collection.renameMode(lightModeId, "Light");
      darkModeId = collection.addMode("Dark");
    } else {
      for (const mode of modes) {
        if (mode.name.toLowerCase().includes("light")) {
          lightModeId = mode.modeId;
        } else if (mode.name.toLowerCase().includes("dark")) {
          darkModeId = mode.modeId;
        }
      }

      if (!darkModeId) {
        darkModeId = collection.addMode("Dark");
      }
    }

    // Get existing local variables in this collection
    const localVariables = figma.variables.getLocalVariables();
    const variableMap = new Map();
    for (const variable of localVariables) {
      if (variable.variableCollectionId === collection.id) {
        variableMap.set(variable.name, variable);
      }
    }

    for (const item of variablesToCreate) {
      try {
        // Find the library variables for light and dark modes
        const lightLibraryVar = findLibraryVariable(
          libraryVariableMap,
          item.lightReference
        );
        const darkLibraryVar = findLibraryVariable(
          libraryVariableMap,
          item.darkReference
        );

        if (!lightLibraryVar) {
          failed.push({
            variableName: item.variableName,
            lightReference: item.lightReference,
            darkReference: item.darkReference,
            error: `Light mode variable not found: ${item.lightReference}`,
          });
          continue;
        }

        if (!darkLibraryVar) {
          failed.push({
            variableName: item.variableName,
            lightReference: item.lightReference,
            darkReference: item.darkReference,
            error: `Dark mode variable not found: ${item.darkReference}`,
          });
          continue;
        }

        // CRITICAL FIX: Use the correct API method to create variable aliases
        console.log(`🔍 Library variable analysis:`, {
          lightVar: {
            name: lightLibraryVar.name,
            id: lightLibraryVar.id,
            key: lightLibraryVar.key,
            allProps: Object.keys(lightLibraryVar),
          },
          darkVar: {
            name: darkLibraryVar.name,
            id: darkLibraryVar.id,
            key: darkLibraryVar.key,
            allProps: Object.keys(darkLibraryVar),
          },
        });

        // Import the library variables first to make them available in this file
        let lightImportedVar, darkImportedVar;

        try {
          console.log(`🔄 Importing library variables...`);
          lightImportedVar = await figma.variables.importVariableByKeyAsync(
            lightLibraryVar.key
          );
          darkImportedVar = await figma.variables.importVariableByKeyAsync(
            darkLibraryVar.key
          );

          console.log(`✅ Successfully imported variables:`, {
            light: {
              originalKey: lightLibraryVar.key,
              importedId: lightImportedVar.id,
              importedName: lightImportedVar.name,
            },
            dark: {
              originalKey: darkLibraryVar.key,
              importedId: darkImportedVar.id,
              importedName: darkImportedVar.name,
            },
          });
        } catch (importError) {
          console.error("❌ Failed to import variables:", importError.message);
          failed.push({
            variableName: item.variableName,
            lightReference: item.lightReference,
            darkReference: item.darkReference,
            error: `Failed to import library variables: ${importError.message}`,
          });
          continue;
        }

        // Use the imported variable IDs
        const lightId = lightImportedVar.id;
        const darkId = darkImportedVar.id;

        if (!lightId || !darkId) {
          failed.push({
            variableName: item.variableName,
            lightReference: item.lightReference,
            darkReference: item.darkReference,
            error: `Invalid variable IDs - light: ${lightId}, dark: ${darkId}`,
          });
          continue;
        }

        let newVariable = variableMap.get(item.variableName);
        let wasUpdated = false;

        if (newVariable) {
          wasUpdated = true;
        } else {
          newVariable = figma.variables.createVariable(
            item.variableName,
            collection,
            "COLOR"
          );
          variableMap.set(item.variableName, newVariable);
        }

        // Create variable aliases using the correct API method
        const lightAlias =
          figma.variables.createVariableAlias(lightImportedVar);
        const darkAlias = figma.variables.createVariableAlias(darkImportedVar);

        console.log(`🔗 Creating aliases with helper method:`, {
          variable: item.variableName,
          lightAlias: lightAlias,
          darkAlias: darkAlias,
        });

        // Set the alias values using the helper-created aliases
        newVariable.setValueForMode(lightModeId, lightAlias);
        newVariable.setValueForMode(darkModeId, darkAlias);

        const resultItem = {
          variableName: item.variableName,
          lightReference: item.lightReference,
          darkReference: item.darkReference,
          lightLibraryVar: lightLibraryVar.name,
          darkLibraryVar: darkLibraryVar.name,
        };

        if (wasUpdated) {
          updated.push(resultItem);
        } else {
          created.push(resultItem);
        }

        console.log(
          `✅ ${wasUpdated ? "Updated" : "Created"} variable: ${
            item.variableName
          }`
        );
      } catch (error) {
        console.error(
          `❌ Failed to create variable ${item.variableName}:`,
          error.message
        );
        failed.push({
          variableName: item.variableName,
          lightReference: item.lightReference,
          darkReference: item.darkReference,
          error: error.message,
        });
      }
    }

    console.log(
      `✅ Complete: ${created.length} created, ${updated.length} updated, ${failed.length} failed`
    );

    figma.ui.postMessage({
      type: "creation-complete",
      success: true,
      results: {
        created,
        updated,
        failed,
        summary: {
          created: created.length,
          updated: updated.length,
          failed: failed.length,
          total: variablesToCreate.length,
        },
      },
    });
  } catch (error) {
    console.error("❌ Variable creation failed:", error.message);
    figma.ui.postMessage({
      type: "creation-complete",
      success: false,
      message: `Error creating variables: ${error.message}`,
    });
  }
}

function extractThemeVariables(cssContent) {
  const themeVariables = [];

  try {
    // Extract @theme section
    const themeRegex = /@theme[^{]*\{([^}]+)\}/;
    const themeMatch = cssContent.match(themeRegex);

    if (!themeMatch) {
      return [];
    }

    // Extract variable definitions from @theme
    const themeVarRegex = /--color-([^:]+):\s*var\(--([^)]+)\)/g;
    const themeVars = new Map();

    let match;
    while ((match = themeVarRegex.exec(themeMatch[1])) !== null) {
      const [, colorName, varReference] = match;
      themeVars.set(varReference, `color/${colorName.replace(/-/g, "/")}`);
    }

    console.log(`🎨 Found ${themeVars.size} theme variables`);

    // Extract light and dark mode definitions
    const lightMatch = cssContent.match(/(?::root|\.light)\s*\{([^}]+)\}/);
    const darkMatch = cssContent.match(/\.dark\s*\{([^}]+)\}/);

    if (!lightMatch || !darkMatch) {
      console.log("❌ Missing light or dark mode definitions");
      return [];
    }

    const lightVars = parseVariableDefinitions(lightMatch[1]);
    const darkVars = parseVariableDefinitions(darkMatch[1]);

    console.log("📋 Light mode mappings:");
    for (const [varName, reference] of lightVars) {
      console.log(`  ${varName} → ${reference}`);
    }

    console.log("📋 Dark mode mappings:");
    for (const [varName, reference] of darkVars) {
      console.log(`  ${varName} → ${reference}`);
    }

    // Match up variables that exist in both light and dark modes
    for (const [varName, lightRef] of lightVars) {
      if (darkVars.has(varName) && themeVars.has(varName)) {
        const darkRef = darkVars.get(varName);
        const finalVarName = themeVars.get(varName);

        const lightFigmaRef = convertCSSVariableToFigmaName(lightRef);
        const darkFigmaRef = convertCSSVariableToFigmaName(darkRef);

        console.log(`✅ Creating mapping: ${finalVarName}`);
        console.log(`  Light: ${lightRef} → ${lightFigmaRef}`);
        console.log(`  Dark: ${darkRef} → ${darkFigmaRef}`);

        themeVariables.push({
          variableName: finalVarName,
          cssVariable: varName,
          lightReference: lightFigmaRef,
          darkReference: darkFigmaRef,
          lightCSSRef: lightRef,
          darkCSSRef: darkRef,
        });
      }
    }

    console.log(`✅ Created ${themeVariables.length} theme variable mappings`);
  } catch (error) {
    console.error("❌ Error in extractThemeVariables:", error);
  }

  return themeVariables;
}

function parseVariableDefinitions(cssBlock) {
  const variables = new Map();
  const varRegex =
    /--([^:]+):\s*(?:--alpha\(\s*)?var\(--([^)]+)\)(?:\s*\/\s*(\d+)%\s*\))?/g;

  let match;
  while ((match = varRegex.exec(cssBlock)) !== null) {
    const [, varName, reference, opacity] = match;

    // If there's an opacity value, append it with underscore
    let finalReference = reference.trim();
    if (opacity) {
      finalReference = `${reference.trim()}_${opacity}`;
    }

    variables.set(varName.trim(), finalReference);
  }

  return variables;
}

function convertCSSVariableToFigmaName(cssVariableName) {
  // Convert CSS variable name to Figma variable name
  // Example: --color-red-75 → color/red/75
  let figmaName = cssVariableName.startsWith("--")
    ? cssVariableName.substring(2)
    : cssVariableName;
  figmaName = figmaName.replace(/-/g, "/");

  if (!figmaName.startsWith("color/")) {
    figmaName = `color/${figmaName}`;
  }

  return figmaName;
}

function findLibraryVariable(libraryVariableMap, figmaVariableName) {
  console.log(`🔍 Looking for: "${figmaVariableName}"`);

  // Only try exact match - no variations
  if (libraryVariableMap.has(figmaVariableName)) {
    console.log(`✅ Found exact match: "${figmaVariableName}"`);
    return libraryVariableMap.get(figmaVariableName);
  }

  console.log(`❌ Not found: "${figmaVariableName}"`);
  return null;
}
