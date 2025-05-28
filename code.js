// Figma Theme Variable Mapper - Maps CSS @theme variables to Figma variables with library/local references
//
// IMPORTANT NAMING CONVENTIONS:
// - Figma variables use forward slashes: color/red/500
// - CSS/Tailwind variables use hyphens with -- prefix: --color-red-500
// - This plugin converts between these two naming conventions
//
// ES5 COMPATIBLE - No arrow functions, template literals, const/let, destructuring, etc.

console.log("🚀 Theme Variables Mapper started");

// Show the plugin UI
figma.showUI(__html__, {
  width: 400,
  height: 700,
  title: "Theme Variables Mapper",
  themeColors: true,
});

console.log("✅ UI shown");

// Track if collections have been loaded
var collectionsLoaded = false;

// ===== MAIN MESSAGE HANDLER =====
figma.ui.onmessage = function (msg) {
  console.log("📨 Received message:", msg.type);

  switch (msg.type) {
    case "get-collections":
      loadCollections();
      break;

    case "parse-css":
      parseCSSContent(msg.cssContent);
      break;

    case "create-variables":
      createVariablesFromCSS(
        msg.variablesToCreate,
        msg.selectedSourceCollectionId,
        msg.sourceCollectionType,
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

// ===== LOAD COLLECTIONS =====
function loadCollections() {
  try {
    console.log("📚 Loading all collections...");

    // Get local collections synchronously
    var localCollections = figma.variables.getLocalVariableCollections();
    var localInfo = [];

    // Process local collections
    for (var i = 0; i < localCollections.length; i++) {
      var collection = localCollections[i];
      var variables = figma.variables.getLocalVariables().filter(function (v) {
        return v.variableCollectionId === collection.id;
      });

      localInfo.push({
        id: collection.id,
        name: collection.name + " (Local)",
        variableCount: variables.length,
        modeCount: collection.modes.length,
        type: "local",
      });
    }

    console.log("✅ Found " + localInfo.length + " local collections");

    // Load library collections asynchronously
    figma.teamLibrary
      .getAvailableLibraryVariableCollectionsAsync()
      .then(function (libraryCollections) {
        console.log(
          "📚 Found " + libraryCollections.length + " library collections"
        );

        // Process each library collection
        var libraryPromises = [];

        for (var i = 0; i < libraryCollections.length; i++) {
          var collection = libraryCollections[i];
          libraryPromises.push(processLibraryCollection(collection));
        }

        // Wait for all library processing to complete
        return Promise.all(libraryPromises);
      })
      .then(function (libraryInfo) {
        // Filter out any failed loads
        var validLibraries = libraryInfo.filter(function (lib) {
          return lib !== null;
        });

        console.log(
          "✅ Successfully loaded " +
            validLibraries.length +
            " library collections"
        );

        // Combine all collections
        var allCollections = validLibraries.concat(localInfo);

        // Send to UI
        figma.ui.postMessage({
          type: "collections-loaded",
          success: true,
          sourceCollections: allCollections,
          targetCollections: localInfo, // Only local collections can be targets
        });

        collectionsLoaded = true;
      })
      .catch(function (error) {
        console.error("❌ Error loading library collections:", error);

        // Still send local collections if libraries fail
        figma.ui.postMessage({
          type: "collections-loaded",
          success: true,
          sourceCollections: localInfo,
          targetCollections: localInfo,
          warning: "Could not load library collections: " + error.message,
        });
      });
  } catch (error) {
    console.error("❌ Error in loadCollections:", error);
    figma.ui.postMessage({
      type: "collections-loaded",
      success: false,
      message: "Error loading collections: " + error.message,
    });
  }
}

// ===== PROCESS LIBRARY COLLECTION =====
function processLibraryCollection(collection) {
  return figma.teamLibrary
    .getVariablesInLibraryCollectionAsync(collection.key)
    .then(function (variables) {
      return {
        id: collection.key,
        name: collection.libraryName + " → " + collection.name,
        variableCount: variables.length,
        type: "library",
        libraryName: collection.libraryName,
        collectionName: collection.name,
      };
    })
    .catch(function (error) {
      console.error("❌ Error loading library " + collection.name + ":", error);
      return {
        id: collection.key,
        name: collection.libraryName + " → " + collection.name,
        variableCount: 0,
        type: "library",
        libraryName: collection.libraryName,
        collectionName: collection.name,
        error: error.message,
      };
    });
}

// ===== PARSE CSS CONTENT =====
function parseCSSContent(cssContent) {
  try {
    console.log("📄 Parsing CSS content...");

    // Validate CSS content
    if (!cssContent || typeof cssContent !== "string") {
      throw new Error("Invalid CSS content received");
    }

    if (cssContent.trim().indexOf("<") === 0) {
      throw new Error("HTML content detected instead of CSS");
    }

    // Extract theme variables
    var themeVariables = extractThemeVariables(cssContent);

    if (themeVariables.length === 0) {
      figma.ui.postMessage({
        type: "parsing-complete",
        success: false,
        message: "No @theme variables found in the CSS file.",
      });
      return;
    }

    console.log("✅ Found " + themeVariables.length + " theme variables");

    // Send results to UI
    figma.ui.postMessage({
      type: "parsing-complete",
      success: true,
      results: {
        variables: themeVariables,
        totalFound: themeVariables.length,
      },
    });
  } catch (error) {
    console.error("❌ CSS parsing failed:", error);
    figma.ui.postMessage({
      type: "parsing-complete",
      success: false,
      message: "Error parsing CSS: " + error.message,
    });
  }
}

// ===== EXTRACT THEME VARIABLES FROM CSS =====
function extractThemeVariables(cssContent) {
  var themeVariables = [];

  try {
    // Find @theme block
    var themeRegex = /@theme[^{]*\{([^}]+)\}/;
    var themeMatch = cssContent.match(themeRegex);

    if (!themeMatch) {
      console.log("❌ No @theme block found");
      return [];
    }

    // Extract variable mappings from @theme
    var themeVars = {};
    var themeVarRegex = /--color-([^:]+):\s*var\(--([^)]+)\)/g;
    var match;

    while ((match = themeVarRegex.exec(themeMatch[1])) !== null) {
      var colorName = match[1];
      var varReference = match[2];
      themeVars[varReference] = "color/" + colorName.replace(/-/g, "/");
    }

    console.log(
      "🎨 Found " +
        Object.keys(themeVars).length +
        " theme variable definitions"
    );

    // Find light and dark mode blocks
    var lightMatch = cssContent.match(/(?::root|\.light)\s*\{([^}]+)\}/);
    var darkMatch = cssContent.match(/\.dark\s*\{([^}]+)\}/);

    if (!lightMatch || !darkMatch) {
      console.log("❌ Missing light or dark mode definitions");
      return [];
    }

    // Parse mode definitions
    var lightVars = parseVariableDefinitions(lightMatch[1]);
    var darkVars = parseVariableDefinitions(darkMatch[1]);

    console.log(
      "💡 Light mode: " + Object.keys(lightVars).length + " variables"
    );
    console.log("🌙 Dark mode: " + Object.keys(darkVars).length + " variables");

    // Create mappings for variables that exist in theme, light, and dark
    for (var varName in themeVars) {
      if (lightVars[varName] && darkVars[varName]) {
        var finalVarName = themeVars[varName];
        var lightRef = convertCSSVariableToFigmaName(lightVars[varName]);
        var darkRef = convertCSSVariableToFigmaName(darkVars[varName]);

        themeVariables.push({
          variableName: finalVarName,
          cssVariable: varName,
          lightReference: lightRef,
          darkReference: darkRef,
          lightCSSRef: lightVars[varName],
          darkCSSRef: darkVars[varName],
        });

        console.log(
          "📍 " + finalVarName + " → Light: " + lightRef + ", Dark: " + darkRef
        );
      }
    }
  } catch (error) {
    console.error("❌ Error extracting theme variables:", error);
  }

  return themeVariables;
}

// ===== PARSE VARIABLE DEFINITIONS FROM CSS BLOCK =====
function parseVariableDefinitions(cssBlock) {
  var variables = {};
  var varRegex =
    /--([^:]+):\s*(?:--alpha\(\s*)?var\(--([^)]+)\)(?:\s*\/\s*(\d+)%\s*\))?/g;
  var match;

  while ((match = varRegex.exec(cssBlock)) !== null) {
    var varName = match[1].trim();
    var reference = match[2].trim();
    var opacity = match[3];

    // Handle opacity values
    if (opacity) {
      reference = reference + "_" + opacity;
    }

    variables[varName] = reference;
  }

  return variables;
}

// ===== CONVERT CSS VARIABLE NAME TO FIGMA FORMAT =====
function convertCSSVariableToFigmaName(cssVariableName) {
  // Remove -- prefix if present
  var figmaName = cssVariableName;
  if (figmaName.indexOf("--") === 0) {
    figmaName = figmaName.substring(2);
  }

  // Replace hyphens with slashes
  figmaName = figmaName.replace(/-/g, "/");

  // Ensure color prefix
  if (figmaName.indexOf("color/") !== 0) {
    figmaName = "color/" + figmaName;
  }

  return figmaName;
}

// ===== CREATE VARIABLES FROM CSS MAPPINGS =====
function createVariablesFromCSS(
  variablesToCreate,
  selectedSourceCollectionId,
  sourceCollectionType,
  collectionChoice,
  existingCollectionId
) {
  try {
    console.log("🚀 Starting variable creation process...");
    console.log("📋 Variables to create: " + variablesToCreate.length);
    console.log(
      "📚 Source collection: " +
        selectedSourceCollectionId +
        " (" +
        sourceCollectionType +
        ")"
    );
    console.log(
      "🎯 Target collection: " +
        (collectionChoice === "new" ? "New Collection" : existingCollectionId)
    );

    // Initialize result arrays
    var created = [];
    var updated = [];
    var failed = [];

    // Load source variables based on type
    if (sourceCollectionType === "library") {
      // Load library variables asynchronously
      figma.teamLibrary
        .getVariablesInLibraryCollectionAsync(selectedSourceCollectionId)
        .then(function (libraryVariables) {
          console.log(
            "📚 Loaded " + libraryVariables.length + " library variables"
          );

          // Convert to map for easy lookup
          var sourceVariableMap = {};
          for (var i = 0; i < libraryVariables.length; i++) {
            var variable = libraryVariables[i];
            sourceVariableMap[variable.name] = variable;
          }

          // Process variables
          processVariables(
            variablesToCreate,
            sourceVariableMap,
            sourceCollectionType,
            collectionChoice,
            existingCollectionId,
            created,
            updated,
            failed
          );
        })
        .catch(function (error) {
          console.error("❌ Failed to load library variables:", error);
          figma.ui.postMessage({
            type: "creation-complete",
            success: false,
            message: "Error loading library variables: " + error.message,
          });
        });
    } else {
      // Load local variables synchronously
      var sourceCollection = figma.variables.getVariableCollectionById(
        selectedSourceCollectionId
      );
      if (!sourceCollection) {
        throw new Error("Source collection not found");
      }

      var allLocalVariables = figma.variables.getLocalVariables();
      var sourceVariables = allLocalVariables.filter(function (v) {
        return v.variableCollectionId === selectedSourceCollectionId;
      });

      console.log("📁 Loaded " + sourceVariables.length + " local variables");

      // Convert to map
      var sourceVariableMap = {};
      for (var i = 0; i < sourceVariables.length; i++) {
        var variable = sourceVariables[i];
        sourceVariableMap[variable.name] = variable;
      }

      // Process variables
      processVariables(
        variablesToCreate,
        sourceVariableMap,
        sourceCollectionType,
        collectionChoice,
        existingCollectionId,
        created,
        updated,
        failed
      );
    }
  } catch (error) {
    console.error("❌ Variable creation failed:", error);
    figma.ui.postMessage({
      type: "creation-complete",
      success: false,
      message: "Error creating variables: " + error.message,
    });
  }
}

// ===== PROCESS VARIABLES (MAIN LOGIC) =====
function processVariables(
  variablesToCreate,
  sourceVariableMap,
  sourceCollectionType,
  collectionChoice,
  existingCollectionId,
  created,
  updated,
  failed
) {
  try {
    // Get or create target collection
    var targetCollection;
    if (collectionChoice === "new") {
      targetCollection =
        figma.variables.createVariableCollection("Theme Variables");
      console.log("✅ Created new collection: Theme Variables");
    } else {
      targetCollection =
        figma.variables.getVariableCollectionById(existingCollectionId);
      if (!targetCollection) {
        throw new Error("Target collection not found");
      }
      console.log("✅ Using existing collection: " + targetCollection.name);
    }

    // Setup modes
    var modes = setupCollectionModes(targetCollection);
    var lightModeId = modes.lightModeId;
    var darkModeId = modes.darkModeId;

    console.log(
      "🌓 Modes configured - Light: " + lightModeId + ", Dark: " + darkModeId
    );

    // Get existing variables in target collection
    var existingVariables = {};
    var localVariables = figma.variables.getLocalVariables();
    for (var i = 0; i < localVariables.length; i++) {
      var v = localVariables[i];
      if (v.variableCollectionId === targetCollection.id) {
        existingVariables[v.name] = v;
      }
    }

    console.log(
      "📊 Found " +
        Object.keys(existingVariables).length +
        " existing variables in target"
    );

    // Process each variable
    if (sourceCollectionType === "library") {
      // For library sources, handle async imports
      processLibraryVariables(
        variablesToCreate,
        sourceVariableMap,
        targetCollection,
        existingVariables,
        lightModeId,
        darkModeId,
        created,
        updated,
        failed
      );
    } else {
      // For local sources, process synchronously
      processLocalVariables(
        variablesToCreate,
        sourceVariableMap,
        targetCollection,
        existingVariables,
        lightModeId,
        darkModeId,
        created,
        updated,
        failed
      );

      // Send results immediately for local processing
      sendResults(created, updated, failed, variablesToCreate.length);
    }
  } catch (error) {
    console.error("❌ Error in processVariables:", error);
    figma.ui.postMessage({
      type: "creation-complete",
      success: false,
      message: "Error processing variables: " + error.message,
    });
  }
}

// ===== SETUP COLLECTION MODES =====
function setupCollectionModes(collection) {
  var lightModeId = collection.defaultModeId;
  var darkModeId = null;

  var modes = collection.modes;

  if (modes.length === 1) {
    // Only one mode, rename to Light and add Dark
    collection.renameMode(lightModeId, "Light");
    darkModeId = collection.addMode("Dark");
  } else {
    // Multiple modes, find Light and Dark
    for (var i = 0; i < modes.length; i++) {
      var mode = modes[i];
      var modeName = mode.name.toLowerCase();
      if (modeName.indexOf("light") !== -1) {
        lightModeId = mode.modeId;
      } else if (modeName.indexOf("dark") !== -1) {
        darkModeId = mode.modeId;
      }
    }

    // Add Dark mode if not found
    if (!darkModeId) {
      darkModeId = collection.addMode("Dark");
    }
  }

  return {
    lightModeId: lightModeId,
    darkModeId: darkModeId,
  };
}

// ===== PROCESS LOCAL VARIABLES =====
function processLocalVariables(
  variablesToCreate,
  sourceVariableMap,
  targetCollection,
  existingVariables,
  lightModeId,
  darkModeId,
  created,
  updated,
  failed
) {
  for (var i = 0; i < variablesToCreate.length; i++) {
    var item = variablesToCreate[i];

    try {
      console.log("🔄 Processing: " + item.variableName);

      // Find source variables
      var lightSourceVar = findSourceVariable(
        sourceVariableMap,
        item.lightReference
      );
      var darkSourceVar = findSourceVariable(
        sourceVariableMap,
        item.darkReference
      );

      if (!lightSourceVar || !darkSourceVar) {
        failed.push({
          variableName: item.variableName,
          lightReference: item.lightReference,
          darkReference: item.darkReference,
          error:
            (!lightSourceVar ? "Light" : "Dark") + " source variable not found",
        });
        continue;
      }

      // Get or create target variable
      var targetVariable = existingVariables[item.variableName];
      var wasUpdated = !!targetVariable;

      if (!targetVariable) {
        targetVariable = figma.variables.createVariable(
          item.variableName,
          targetCollection,
          "COLOR"
        );
        existingVariables[item.variableName] = targetVariable;
      }

      // Create aliases
      var lightAlias = figma.variables.createVariableAlias(lightSourceVar);
      var darkAlias = figma.variables.createVariableAlias(darkSourceVar);

      // Set values for modes
      targetVariable.setValueForMode(lightModeId, lightAlias);
      targetVariable.setValueForMode(darkModeId, darkAlias);

      // Record result
      var result = {
        variableName: item.variableName,
        lightReference: item.lightReference,
        darkReference: item.darkReference,
        lightSourceVar: lightSourceVar.name,
        darkSourceVar: darkSourceVar.name,
      };

      if (wasUpdated) {
        updated.push(result);
        console.log("✏️ Updated: " + item.variableName);
      } else {
        created.push(result);
        console.log("✨ Created: " + item.variableName);
      }
    } catch (error) {
      console.error("❌ Failed to process " + item.variableName + ":", error);
      failed.push({
        variableName: item.variableName,
        lightReference: item.lightReference,
        darkReference: item.darkReference,
        error: error.message,
      });
    }
  }
}

// ===== PROCESS LIBRARY VARIABLES =====
function processLibraryVariables(
  variablesToCreate,
  sourceVariableMap,
  targetCollection,
  existingVariables,
  lightModeId,
  darkModeId,
  created,
  updated,
  failed
) {
  var promises = [];

  // Create a promise for each variable
  for (var i = 0; i < variablesToCreate.length; i++) {
    var item = variablesToCreate[i];
    var promise = processLibraryVariable(
      item,
      sourceVariableMap,
      targetCollection,
      existingVariables,
      lightModeId,
      darkModeId,
      created,
      updated,
      failed
    );
    promises.push(promise);
  }

  // Wait for all imports to complete
  Promise.all(promises)
    .then(function () {
      console.log("✅ All library imports completed");
      sendResults(created, updated, failed, variablesToCreate.length);
    })
    .catch(function (error) {
      console.error("❌ Error during library imports:", error);
      sendResults(created, updated, failed, variablesToCreate.length);
    });
}

// ===== PROCESS SINGLE LIBRARY VARIABLE =====
function processLibraryVariable(
  item,
  sourceVariableMap,
  targetCollection,
  existingVariables,
  lightModeId,
  darkModeId,
  created,
  updated,
  failed
) {
  return new Promise(function (resolve) {
    try {
      console.log("🔄 Processing: " + item.variableName);

      // Find source variables
      var lightSourceVar = findSourceVariable(
        sourceVariableMap,
        item.lightReference
      );
      var darkSourceVar = findSourceVariable(
        sourceVariableMap,
        item.darkReference
      );

      if (!lightSourceVar || !darkSourceVar) {
        failed.push({
          variableName: item.variableName,
          lightReference: item.lightReference,
          darkReference: item.darkReference,
          error:
            (!lightSourceVar ? "Light" : "Dark") + " source variable not found",
        });
        resolve();
        return;
      }

      // Get or create target variable
      var targetVariable = existingVariables[item.variableName];
      var wasUpdated = !!targetVariable;

      if (!targetVariable) {
        targetVariable = figma.variables.createVariable(
          item.variableName,
          targetCollection,
          "COLOR"
        );
        existingVariables[item.variableName] = targetVariable;
      }

      // Import library variables
      var lightPromise = figma.variables.importVariableByKeyAsync(
        lightSourceVar.key
      );
      var darkPromise =
        lightSourceVar.key === darkSourceVar.key
          ? lightPromise
          : figma.variables.importVariableByKeyAsync(darkSourceVar.key);

      Promise.all([lightPromise, darkPromise])
        .then(function (imported) {
          var importedLight = imported[0];
          var importedDark = imported[1];

          // Create aliases
          var lightAlias = figma.variables.createVariableAlias(importedLight);
          var darkAlias = figma.variables.createVariableAlias(importedDark);

          // Set values for modes
          targetVariable.setValueForMode(lightModeId, lightAlias);
          targetVariable.setValueForMode(darkModeId, darkAlias);

          // Record result
          var result = {
            variableName: item.variableName,
            lightReference: item.lightReference,
            darkReference: item.darkReference,
            lightSourceVar: lightSourceVar.name,
            darkSourceVar: darkSourceVar.name,
          };

          if (wasUpdated) {
            updated.push(result);
            console.log("✏️ Updated: " + item.variableName);
          } else {
            created.push(result);
            console.log("✨ Created: " + item.variableName);
          }

          resolve();
        })
        .catch(function (error) {
          console.error(
            "❌ Import failed for " + item.variableName + ":",
            error
          );
          failed.push({
            variableName: item.variableName,
            lightReference: item.lightReference,
            darkReference: item.darkReference,
            error: "Import failed: " + error.message,
          });
          resolve();
        });
    } catch (error) {
      console.error("❌ Error processing " + item.variableName + ":", error);
      failed.push({
        variableName: item.variableName,
        lightReference: item.lightReference,
        darkReference: item.darkReference,
        error: error.message,
      });
      resolve();
    }
  });
}

// ===== FIND SOURCE VARIABLE =====
function findSourceVariable(sourceVariableMap, variableName) {
  // Try exact match first
  if (sourceVariableMap[variableName]) {
    return sourceVariableMap[variableName];
  }

  // Try with/without color prefix
  var withPrefix = "color/" + variableName.replace(/^color\//, "");
  var withoutPrefix = variableName.replace(/^color\//, "");

  return (
    sourceVariableMap[withPrefix] || sourceVariableMap[withoutPrefix] || null
  );
}

// ===== SEND RESULTS TO UI =====
function sendResults(created, updated, failed, total) {
  console.log("📊 === FINAL RESULTS ===");
  console.log("✅ Created: " + created.length);
  console.log("✏️ Updated: " + updated.length);
  console.log("❌ Failed: " + failed.length);

  if (failed.length > 0) {
    console.log("❌ Failed variables:");
    for (var i = 0; i < failed.length; i++) {
      console.log("  - " + failed[i].variableName + ": " + failed[i].error);
    }
  }

  figma.ui.postMessage({
    type: "creation-complete",
    success: true,
    results: {
      created: created,
      updated: updated,
      failed: failed,
      summary: {
        created: created.length,
        updated: updated.length,
        failed: failed.length,
        total: total,
      },
    },
  });
}

// Load collections on startup
loadCollections();
