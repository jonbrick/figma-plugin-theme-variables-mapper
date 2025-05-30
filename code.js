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

// Global state
var collectionsLoaded = false;
var availableCollections = [];
var uploadedJsonData = null;
var detectedSentiment = null;
var selectedMode = "replace";
var importedVariableIds = [];

// DEBUGGING: JSON upload threshold (set to lower number for testing)
var JSON_UPLOAD_THRESHOLD = 400; // Change this to test JSON upload flow

// ===== NEW MESSAGE TYPE: LOG SOURCE VARIABLES =====
figma.ui.onmessage = function (msg) {
  console.log("📨 Received message:", msg.type);

  switch (msg.type) {
    case "get-collections":
      loadCollections();
      break;

    case "parse-css":
      parseCSSContent(msg.cssContent, msg.filename);
      break;

    case "log-source-variables":
      logSourceVariables(msg.sourceCollectionId);
      break;

    case "hundred-percent-continue":
      // User chose to continue with 100% variables
      figma.ui.postMessage({
        type: "parsing-complete",
        success: true,
        results: {
          variables: msg.allVariables,
          totalFound: msg.allVariables.length,
          sentiment: msg.sentiment,
        },
      });
      break;

    case "hundred-percent-cancel":
      // User chose to cancel and fix CSS
      figma.ui.postMessage({
        type: "hundred-percent-cancelled",
        success: true,
      });
      break;

    case "create-variables":
      uploadedJsonData = msg.jsonData || null;
      selectedMode = msg.mode || "replace";
      detectedSentiment = msg.sentiment || null;

      console.log("📊 Create Variables Context:", {
        sentiment: detectedSentiment,
        mode: selectedMode,
        hasJsonData: uploadedJsonData
          ? "Yes (" + Object.keys(uploadedJsonData).length + " variables)"
          : "No",
        sourceCollection: msg.selectedSourceCollectionId,
        targetCollection: msg.existingCollectionId,
      });

      createVariablesFromCSS(
        msg.variablesToCreate,
        msg.selectedSourceCollectionId,
        msg.sourceCollectionType,
        msg.existingCollectionId
      );
      break;

    case "close-plugin":
      cleanupImportedVariables().then(function () {
        figma.closePlugin();
      });
      break;

    default:
      console.error("❌ Unknown message type:", msg.type);
  }
};

function logSourceVariables(sourceCollectionId) {
  var sourceCollection = findCollectionById(sourceCollectionId);

  if (!sourceCollection) {
    console.error("❌ Source collection not found");
    return;
  }

  if (sourceCollection.type === "library") {
    figma.teamLibrary
      .getVariablesInLibraryCollectionAsync(sourceCollection.id)
      .then(function (libraryVariables) {
        console.log(
          "🗂️ SOURCE VARIABLES:",
          libraryVariables.map(function (v) {
            return v;
          })
        );

        // Function to find the key by name
        function findSourceVariableKeyByName(libraryVariables, targetName) {
          for (var i = 0; i < libraryVariables.length; i++) {
            if (libraryVariables[i].name === targetName) {
              return libraryVariables[i].key;
            }
          }
          return null;
        }

        // TEST
        var foundKey = findSourceVariableKeyByName(
          libraryVariables,
          "color/sky/500_35"
        );
        console.log("Key for color/sky/500_35:", foundKey);

        // PUT THE NEW CODE HERE - right after the existing test
        if (foundKey) {
          console.log("🔑 Using this key:", foundKey);

          figma.variables
            .importVariableByKeyAsync(foundKey)
            .then(function (retrievedVariable) {
              console.log("📥 Retrieved variable object:", retrievedVariable);
              console.log("📥 Object properties:", {
                id: retrievedVariable.id,
                name: retrievedVariable.name,
                dataType: typeof retrievedVariable,
              });
            })
            .catch(function (error) {
              console.error("❌ Retrieval failed:", error);
            });
        } else {
          console.log("❌ No key located");
        }
      })
      .catch(function (error) {
        console.error("❌ Failed to load source variables:", error);
      });
  } else {
    var localVariables = figma.variables
      .getLocalVariables()
      .filter(function (v) {
        return v.variableCollectionId === sourceCollection.id;
      });
    console.log(
      "🗂️ SOURCE VARIABLES:",
      localVariables.map(function (v) {
        return v;
      })
    );
  }
}

// ===== UTILITY FUNCTIONS =====

function detectSentimentFromFilename(filename) {
  if (!filename) return null;
  var match = filename.match(/(danger|warning|success|info|brand|neutral)/);
  return match ? match[1] : null;
}

function createCollectionInfo(collection, variables, type, error) {
  return {
    id: type === "library" ? collection.key : collection.id,
    figmaId: collection.id,
    displayName:
      type === "library"
        ? collection.libraryName + " → " + collection.name
        : collection.name + " (Local)",
    libraryName: collection.libraryName || "Unknown Library",
    collectionName: collection.name,
    variableCount: variables ? variables.length : 0,
    type: type,
    modeCount:
      collection.modes && collection.modes.length ? collection.modes.length : 1,
    lastModified: collection.lastModified || null,
    description: collection.description || "",
    error: error || null,
  };
}

function isSteplessColor(name) {
  var colorName = name.split("/").pop().toLowerCase();
  return colorName === "black" || colorName === "white";
}

// ===== COLLECTION LOADING =====

function loadCollections() {
  try {
    console.log("📚 Loading collections...");

    // Get local collections synchronously
    var localCollections = figma.variables.getLocalVariableCollections();
    var localInfo = localCollections.map(function (collection) {
      var variables = figma.variables.getLocalVariables().filter(function (v) {
        return v.variableCollectionId === collection.id;
      });
      return createCollectionInfo(collection, variables, "local");
    });

    console.log("📁 Local collections loaded:", localInfo.length);

    // Load library collections asynchronously
    figma.teamLibrary
      .getAvailableLibraryVariableCollectionsAsync()
      .then(function (libraryCollections) {
        console.log(
          "📚 Found",
          libraryCollections.length,
          "library collections"
        );

        // Process each library collection
        var libraryPromises = libraryCollections.map(function (collection) {
          return processLibraryCollection(collection);
        });

        return Promise.all(libraryPromises);
      })
      .then(function (libraryInfo) {
        // Filter out failed loads
        var validLibraries = libraryInfo.filter(function (lib) {
          return lib !== null && !lib.error;
        });

        console.log("✅ Library collections processed:", validLibraries.length);

        // Store for later use
        availableCollections = validLibraries.concat(localInfo);

        // Send to UI
        figma.ui.postMessage({
          type: "collections-loaded",
          success: true,
          sourceCollections: availableCollections,
          targetCollections: localInfo,
        });

        collectionsLoaded = true;
      })
      .catch(function (error) {
        console.error("❌ Error loading library collections:", error);

        // Still send local collections if libraries fail
        availableCollections = localInfo;
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

function processLibraryCollection(collection) {
  console.log("📚 Processing library collection:", collection.name);

  return figma.teamLibrary
    .getVariablesInLibraryCollectionAsync(collection.key)
    .then(function (variables) {
      console.log(
        "📊 Library '" + collection.name + "':",
        variables.length,
        "variables"
      );

      // Import a few variables to test access and store their IDs for cleanup
      var testImportPromises = variables.slice(0, 3).map(function (variable) {
        return figma.variables
          .importVariableByKeyAsync(variable.key)
          .then(function (imported) {
            if (imported && imported.id) {
              importedVariableIds.push(imported.id);
            }
            return imported;
          })
          .catch(function (error) {
            console.warn(
              "⚠️ Failed to import test variable:",
              variable.name,
              error.message
            );
            return null;
          });
      });

      return Promise.all(testImportPromises).then(function () {
        return createCollectionInfo(collection, variables, "library");
      });
    })
    .catch(function (error) {
      console.error(
        "❌ Error processing library collection '" + collection.name + "':",
        error
      );
      return createCollectionInfo(collection, null, "library", error.message);
    });
}

function cleanupImportedVariables() {
  return Promise.resolve()
    .then(function () {
      if (!importedVariableIds || importedVariableIds.length === 0) {
        console.log("🧹 No imported variables to clean up");
        return;
      }

      console.log(
        "🧹 Cleaning up",
        importedVariableIds.length,
        "imported variables..."
      );
      var keptCount = 0;

      importedVariableIds.forEach(function (id) {
        var variable = figma.variables.getVariableById(id);
        if (variable) {
          try {
            variable.remove();
          } catch (e) {
            if (
              e.message &&
              e.message.includes("Removing this node is not allowed")
            ) {
              keptCount++;
            } else {
              console.warn(
                "⚠️ Unexpected cleanup error for variable ID " + id + ":",
                e.message
              );
            }
          }
        }
      });

      if (keptCount > 0) {
        console.log("ℹ️ Kept " + keptCount + " variables that are in use");
      }
      console.log("✅ Cleanup routine finished");

      // Clear the list
      importedVariableIds = [];
    })
    .catch(function (error) {
      console.warn("⚠️ Error during cleanup:", error);
    });
}

// ===== CSS PARSING =====

function parseCSSContent(cssContent, filename) {
  try {
    console.log("📄 Parsing CSS content...");
    console.log("📁 Filename:", filename);

    // Detect sentiment from filename
    var sentiment = detectSentimentFromFilename(filename);
    if (filename && !sentiment) {
      figma.ui.postMessage({
        type: "parsing-complete",
        success: false,
        message:
          "Filename must be one of: danger.css, warning.css, success.css, info.css, brand.css, or neutral.css",
      });
      return;
    }

    console.log("🎯 Detected sentiment:", sentiment || "none");

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

    console.log("🎨 Extracted theme variables:", {
      total: themeVariables.length,
      sentiment: sentiment || "none",
      variables: themeVariables.map(function (v) {
        return v.variableName;
      }),
    });

    // Check for 100% opacity variables before sending results
    var hundredPercentVariables =
      extractHundredPercentVariables(themeVariables);

    if (hundredPercentVariables.length > 0) {
      // Send 100% detection message instead of parsing complete
      figma.ui.postMessage({
        type: "hundred-percent-detected",
        success: true,
        variables: hundredPercentVariables,
        totalThemeVars: themeVariables.length,
        allVariables: themeVariables,
        sentiment: sentiment,
      });
      return;
    }

    // Send normal results to UI
    figma.ui.postMessage({
      type: "parsing-complete",
      success: true,
      results: {
        variables: themeVariables,
        totalFound: themeVariables.length,
        sentiment: sentiment,
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

    console.log("✅ Found @theme block");

    // Extract variable mappings from @theme
    var themeVars = {};
    var themeVarRegex = /--color-([^:]+):\s*var\(--([^)]+)\)/g;
    var match;

    while ((match = themeVarRegex.exec(themeMatch[1])) !== null) {
      var colorName = match[1];
      var varReference = match[2];
      themeVars[varReference] = "color/" + colorName.replace(/-/g, "/");
    }

    console.log("📋 Theme mappings found:", Object.keys(themeVars).length);

    // Find light and dark mode blocks
    var lightMatch = cssContent.match(/(?::root|\.light)\s*\{([^}]+)\}/);
    var darkMatch = cssContent.match(/\.dark\s*\{([^}]+)\}/);

    if (!lightMatch || !darkMatch) {
      console.log("❌ Missing light or dark mode definitions");
      return [];
    }

    console.log("✅ Found light and dark mode blocks");

    // Parse mode definitions
    var lightVars = parseVariableDefinitions(lightMatch[1]);
    var darkVars = parseVariableDefinitions(darkMatch[1]);

    console.log("📊 Mode variables:", {
      light: Object.keys(lightVars).length,
      dark: Object.keys(darkVars).length,
    });

    // Create mappings for variables that exist in theme, light, and dark
    for (var varName in themeVars) {
      if (lightVars[varName] && darkVars[varName]) {
        var finalVarName = themeVars[varName];
        var lightRef = convertCSSVariableToFigmaName(lightVars[varName]);
        var darkRef = convertCSSVariableToFigmaName(darkVars[varName]);

        var variable = {
          variableName: finalVarName,
          lightReference: lightRef,
          darkReference: darkRef,
          lightValue: lightVars[varName],
          darkValue: darkVars[varName],
        };

        themeVariables.push(variable);
        console.log("🔗 Mapped:", finalVarName, "→", {
          light: lightRef,
          dark: darkRef,
        });
      }
    }

    console.log(
      "✅ Successfully extracted",
      themeVariables.length,
      "theme variables"
    );
  } catch (error) {
    console.error("❌ Error extracting theme variables:", error);
  }

  return themeVariables;
}

function extractHundredPercentVariables(themeVariables) {
  var hundredPercentVars = [];

  for (var i = 0; i < themeVariables.length; i++) {
    var variable = themeVariables[i];

    // Check if light or dark reference ends with _100
    if (
      variable.lightReference &&
      variable.lightReference.indexOf("_100") !== -1
    ) {
      hundredPercentVars.push({
        variableName: variable.variableName,
        lightReference: variable.lightReference,
        darkReference: variable.darkReference,
        type: "light",
      });
    } else if (
      variable.darkReference &&
      variable.darkReference.indexOf("_100") !== -1
    ) {
      hundredPercentVars.push({
        variableName: variable.variableName,
        lightReference: variable.lightReference,
        darkReference: variable.darkReference,
        type: "dark",
      });
    }
  }

  return hundredPercentVars;
}

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
      if (opacity === "100") {
        reference = reference + "_100"; // Preserve explicit 100% suffix
      } else if (opacity.length === 1) {
        reference = reference + "_0" + opacity;
      } else {
        reference = reference + "_" + opacity;
      }
    }

    variables[varName] = reference;
  }

  return variables;
}

function convertCSSVariableToFigmaName(cssVariableName) {
  var figmaName = cssVariableName;

  // Remove -- prefix if present
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

// ===== VARIABLE CREATION =====

function createVariablesFromCSS(
  variablesToCreate,
  sourceCollectionId,
  sourceCollectionType,
  targetCollectionId
) {
  try {
    // Find collections
    var sourceCollection = findCollectionById(sourceCollectionId);
    var targetCollection =
      figma.variables.getVariableCollectionById(targetCollectionId);

    if (!sourceCollection) {
      throw new Error("Source collection not found");
    }

    if (!targetCollection) {
      throw new Error("Target collection not found in Figma");
    }

    // Setup target collection modes
    var modes = setupCollectionModes(targetCollection);

    // Get existing variables in target collection
    var existingVariables = getExistingVariables(targetCollection.id);

    // Handle sentiment-based cleanup
    var orphanedVariables = [];
    if (detectedSentiment && selectedMode === "replace") {
      orphanedVariables = findOrphanedSentimentVariables(
        existingVariables,
        variablesToCreate,
        detectedSentiment
      );
    }

    // Route to appropriate processor
    if (sourceCollectionType === "library") {
      processLibraryVariables(
        variablesToCreate,
        sourceCollection,
        targetCollection,
        existingVariables,
        modes,
        orphanedVariables
      );
    } else {
      processLocalVariables(
        variablesToCreate,
        sourceCollection,
        targetCollection,
        existingVariables,
        modes,
        orphanedVariables
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

function findCollectionById(collectionId) {
  for (var i = 0; i < availableCollections.length; i++) {
    if (availableCollections[i].id === collectionId) {
      return availableCollections[i];
    }
  }
  return null;
}

function setupCollectionModes(collection) {
  var lightModeId = collection.defaultModeId;
  var darkModeId = null;

  if (collection.modes.length === 1) {
    collection.renameMode(lightModeId, "Light");
    darkModeId = collection.addMode("Dark");
  } else {
    for (var i = 0; i < collection.modes.length; i++) {
      var mode = collection.modes[i];
      var modeName = mode.name.toLowerCase();
      if (modeName.indexOf("light") !== -1) {
        lightModeId = mode.modeId;
      } else if (modeName.indexOf("dark") !== -1) {
        darkModeId = mode.modeId;
      }
    }

    if (!darkModeId) {
      darkModeId = collection.addMode("Dark");
    }
  }

  return {
    lightModeId: lightModeId,
    darkModeId: darkModeId,
  };
}

function getExistingVariables(collectionId) {
  var existingVariables = {};
  var localVariables = figma.variables.getLocalVariables();

  for (var i = 0; i < localVariables.length; i++) {
    var variable = localVariables[i];
    if (variable.variableCollectionId === collectionId) {
      existingVariables[variable.name] = variable;
    }
  }

  return existingVariables;
}

function findOrphanedSentimentVariables(
  existingVariables,
  cssVariables,
  sentiment
) {
  var orphaned = [];
  var sentimentPattern = new RegExp("color/[^/]+/" + sentiment + "($|/)");

  // Build lookup of CSS variable names
  var cssVariableNames = {};
  for (var i = 0; i < cssVariables.length; i++) {
    cssVariableNames[cssVariables[i].variableName] = true;
  }

  // Check existing variables for orphaned sentiment variables
  for (var name in existingVariables) {
    if (sentimentPattern.test(name) && !cssVariableNames[name]) {
      orphaned.push({
        variableName: name,
        variable: existingVariables[name],
      });
    }
  }

  return orphaned;
}

function removeOrphanedVariables(orphanedVariables) {
  var removed = [];

  for (var i = 0; i < orphanedVariables.length; i++) {
    try {
      console.log(
        "🗑️ Removing orphaned variable:",
        orphanedVariables[i].variableName
      );
      orphanedVariables[i].variable.remove();
      removed.push({
        variableName: orphanedVariables[i].variableName,
      });
    } catch (error) {
      console.error(
        "❌ Failed to remove variable:",
        orphanedVariables[i].variableName,
        error.message
      );
    }
  }

  return removed;
}

// ===== LIBRARY VARIABLE PROCESSING =====

function processLibraryVariables(
  variablesToCreate,
  sourceCollection,
  targetCollection,
  existingVariables,
  modes,
  orphanedVariables
) {
  console.log("📚 Processing library variables...");

  // Remove orphaned variables first
  var removed = removeOrphanedVariables(orphanedVariables);

  var created = [];
  var updated = [];
  var failed = [];

  if (uploadedJsonData) {
    console.log("⚡ Using JSON data for optimization");
    processLibraryVariablesWithJson(
      variablesToCreate,
      targetCollection,
      existingVariables,
      modes,
      created,
      updated,
      failed,
      removed
    );
  } else {
    console.log("🐌 Using standard library processing");
    processLibraryVariablesStandard(
      variablesToCreate,
      sourceCollection,
      targetCollection,
      existingVariables,
      modes,
      created,
      updated,
      failed,
      removed
    );
  }
}

function processLibraryVariablesWithJson(
  variablesToCreate,
  targetCollection,
  existingVariables,
  modes,
  created,
  updated,
  failed,
  removed
) {
  var promises = [];

  for (var i = 0; i < variablesToCreate.length; i++) {
    var variable = variablesToCreate[i];
    promises.push(
      processLibraryVariableWithJson(
        variable,
        targetCollection,
        existingVariables,
        modes,
        created,
        updated,
        failed
      )
    );
  }

  Promise.all(promises)
    .then(function () {
      sendResults(created, updated, failed, removed);
    })
    .catch(function (error) {
      console.error("❌ JSON processing failed:", error);
      sendResults(created, updated, failed, removed);
    });
}

function processLibraryVariableWithJson(
  variable,
  targetCollection,
  existingVariables,
  modes,
  created,
  updated,
  failed
) {
  return new Promise(function (resolve) {
    try {
      console.log("🔄 Processing:", variable.variableName);
      console.log("🔍 Looking for keys:", {
        lightRef: variable.lightReference,
        darkRef: variable.darkReference,
      });

      // Find variable keys in JSON data
      var lightKey = findVariableKeyInJson(
        uploadedJsonData,
        variable.lightReference
      );
      var darkKey = findVariableKeyInJson(
        uploadedJsonData,
        variable.darkReference
      );

      console.log("🔑 Key lookup results:", {
        variable: variable.variableName,
        lightKey: lightKey,
        darkKey: darkKey,
        lightRef: variable.lightReference,
        darkRef: variable.darkReference,
      });

      if (!lightKey || !darkKey) {
        console.warn("⚠️ Keys not found for:", variable.variableName);
        failed.push({
          variableName: variable.variableName,
          lightReference: variable.lightReference,
          darkReference: variable.darkReference,
          error: "Variable key not found in JSON data",
        });
        resolve();
        return;
      }

      // Get or create target variable
      var targetVariable = existingVariables[variable.variableName];
      var wasUpdated = !!targetVariable;

      if (!targetVariable) {
        console.log("➕ Creating new variable:", variable.variableName);
        targetVariable = figma.variables.createVariable(
          variable.variableName,
          targetCollection,
          "COLOR"
        );
        existingVariables[variable.variableName] = targetVariable;
      } else {
        console.log("🔄 Updating existing variable:", variable.variableName);
      }

      console.log("📞 Calling importVariableByKeyAsync with keys:", {
        lightKey: lightKey,
        darkKey: darkKey,
      });

      // Import library variables using keys
      var lightPromise = figma.variables.importVariableByKeyAsync(lightKey);
      var darkPromise =
        lightKey === darkKey
          ? lightPromise
          : figma.variables.importVariableByKeyAsync(darkKey);

      Promise.all([lightPromise, darkPromise])
        .then(function (imported) {
          console.log("📥 Import response received:", {
            variable: variable.variableName,
            lightImported: imported[0]
              ? {
                  id: imported[0].id,
                  name: imported[0].name,
                  type: typeof imported[0],
                }
              : "null/undefined",
            darkImported: imported[1]
              ? {
                  id: imported[1].id,
                  name: imported[1].name,
                  type: typeof imported[1],
                }
              : "null/undefined",
          });

          var importedLight = imported[0];
          var importedDark = imported[1];

          if (!importedLight || !importedDark) {
            console.error("❌ Import returned null/undefined:", {
              variable: variable.variableName,
              lightResult: importedLight,
              darkResult: importedDark,
            });
            failed.push({
              variableName: variable.variableName,
              lightReference: variable.lightReference,
              darkReference: variable.darkReference,
              error: "Import returned null/undefined",
            });
            resolve();
            return;
          }

          console.log("🔗 Creating aliases for:", variable.variableName);

          // Create aliases using the correct API
          var lightAlias = figma.variables.createVariableAlias(importedLight);
          var darkAlias = figma.variables.createVariableAlias(importedDark);

          console.log("📎 Alias creation results:", {
            variable: variable.variableName,
            lightAlias: lightAlias ? "success" : "failed",
            darkAlias: darkAlias ? "success" : "failed",
          });

          // Set values for modes
          targetVariable.setValueForMode(modes.lightModeId, lightAlias);
          targetVariable.setValueForMode(modes.darkModeId, darkAlias);

          console.log("✅ Success:", variable.variableName);

          // Record result
          var result = {
            variableName: variable.variableName,
            lightReference: variable.lightReference,
            darkReference: variable.darkReference,
            lightSourceVar: importedLight.name,
            darkSourceVar: importedDark.name,
          };

          if (wasUpdated) {
            updated.push(result);
          } else {
            created.push(result);
          }

          resolve();
        })
        .catch(function (error) {
          console.error(
            "❌ Import promise failed for:",
            variable.variableName,
            {
              error: error,
              message: error.message,
              stack: error.stack,
            }
          );
          failed.push({
            variableName: variable.variableName,
            lightReference: variable.lightReference,
            darkReference: variable.darkReference,
            error: "Import failed: " + error.message,
          });
          resolve();
        });
    } catch (error) {
      console.error("❌ Processing error for:", variable.variableName, {
        error: error,
        message: error.message,
        stack: error.stack,
      });
      failed.push({
        variableName: variable.variableName,
        lightReference: variable.lightReference,
        darkReference: variable.darkReference,
        error: error.message,
      });
      resolve();
    }
  });
}

function processLibraryVariablesStandard(
  variablesToCreate,
  sourceCollection,
  targetCollection,
  existingVariables,
  modes,
  created,
  updated,
  failed,
  removed
) {
  // First get all variables from the library collection
  figma.teamLibrary
    .getVariablesInLibraryCollectionAsync(sourceCollection.id)
    .then(function (libraryVariables) {
      console.log(
        "📚 Loaded",
        libraryVariables.length,
        "variables from library"
      );

      // Create variable map
      var sourceVariableMap = {};
      for (var i = 0; i < libraryVariables.length; i++) {
        sourceVariableMap[libraryVariables[i].name] = libraryVariables[i];
      }

      // Process each variable
      var promises = [];
      for (var j = 0; j < variablesToCreate.length; j++) {
        var variable = variablesToCreate[j];
        promises.push(
          processLibraryVariableStandard(
            variable,
            sourceVariableMap,
            targetCollection,
            existingVariables,
            modes,
            created,
            updated,
            failed
          )
        );
      }

      return Promise.all(promises);
    })
    .then(function () {
      sendResults(created, updated, failed, removed);
    })
    .catch(function (error) {
      console.error("❌ Standard library processing failed:", error);
      sendResults(created, updated, failed, removed);
    });
}

function processLibraryVariableStandard(
  variable,
  sourceVariableMap,
  targetCollection,
  existingVariables,
  modes,
  created,
  updated,
  failed
) {
  return new Promise(function (resolve) {
    try {
      // Find source variables
      var lightSourceVar = findSourceVariable(
        sourceVariableMap,
        variable.lightReference
      );
      var darkSourceVar = findSourceVariable(
        sourceVariableMap,
        variable.darkReference
      );

      if (!lightSourceVar || !darkSourceVar) {
        failed.push({
          variableName: variable.variableName,
          lightReference: variable.lightReference,
          darkReference: variable.darkReference,
          error:
            (!lightSourceVar ? "Light" : "Dark") + " source variable not found",
        });
        resolve();
        return;
      }

      // Get or create target variable
      var targetVariable = existingVariables[variable.variableName];
      var wasUpdated = !!targetVariable;

      if (!targetVariable) {
        targetVariable = figma.variables.createVariable(
          variable.variableName,
          targetCollection,
          "COLOR"
        );
        existingVariables[variable.variableName] = targetVariable;
      }

      // Import and create aliases
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

          var lightAlias = figma.variables.createVariableAlias(importedLight);
          var darkAlias = figma.variables.createVariableAlias(importedDark);

          targetVariable.setValueForMode(modes.lightModeId, lightAlias);
          targetVariable.setValueForMode(modes.darkModeId, darkAlias);

          var result = {
            variableName: variable.variableName,
            lightReference: variable.lightReference,
            darkReference: variable.darkReference,
            lightSourceVar: importedLight.name,
            darkSourceVar: importedDark.name,
          };

          if (wasUpdated) {
            updated.push(result);
          } else {
            created.push(result);
          }

          resolve();
        })
        .catch(function (error) {
          failed.push({
            variableName: variable.variableName,
            lightReference: variable.lightReference,
            darkReference: variable.darkReference,
            error: "Import failed: " + error.message,
          });
          resolve();
        });
    } catch (error) {
      failed.push({
        variableName: variable.variableName,
        lightReference: variable.lightReference,
        darkReference: variable.darkReference,
        error: error.message,
      });
      resolve();
    }
  });
}

function findVariableKeyInJson(jsonData, variableName) {
  console.log("🔍 JSON lookup for:", variableName);

  // Use variable name as-is (no normalization)
  var normalizedName = variableName;
  console.log("📝 Variable name:", normalizedName);

  // Handle stepless colors (black and white)
  if (isSteplessColor(normalizedName)) {
    var simplePath = "color/" + normalizedName.split("/").pop();
    console.log("🎨 Trying stepless color path:", simplePath);
    if (jsonData[simplePath]) {
      console.log("✅ Found stepless color key:", jsonData[simplePath].key);
      return jsonData[simplePath].key;
    }
  }

  // Try exact match first
  console.log("🎯 Trying exact match:", normalizedName);
  if (jsonData[normalizedName]) {
    console.log("✅ Found exact match key:", jsonData[normalizedName].key);
    return jsonData[normalizedName].key;
  }
  // Try with/without color prefix
  var withPrefix = "color/" + normalizedName.replace(/^color\//, "");
  var withoutPrefix = normalizedName.replace(/^color\//, "");

  console.log("🔄 Trying with prefix:", withPrefix);
  if (jsonData[withPrefix]) {
    console.log("✅ Found with prefix key:", jsonData[withPrefix].key);
    return jsonData[withPrefix].key;
  }

  console.log("🔄 Trying without prefix:", withoutPrefix);
  if (jsonData[withoutPrefix]) {
    console.log("✅ Found without prefix key:", jsonData[withoutPrefix].key);
    return jsonData[withoutPrefix].key;
  }

  console.log("❌ No key found for:", variableName);
  console.log(
    "🗂️ Available keys (first 10):",
    Object.keys(jsonData).slice(0, 10)
  );

  return null;
}

function findSourceVariable(sourceVariableMap, variableName) {
  // Try exact match first
  if (sourceVariableMap[variableName]) {
    return sourceVariableMap[variableName];
  }

  // Try with/without color prefix
  var withPrefix = "color/" + variableName.replace(/^color\//, "");
  var withoutPrefix = variableName.replace(/^color\//, "");

  if (sourceVariableMap[withPrefix]) {
    return sourceVariableMap[withPrefix];
  }

  if (sourceVariableMap[withoutPrefix]) {
    return sourceVariableMap[withoutPrefix];
  }

  // Handle stepless colors
  if (isSteplessColor(variableName)) {
    var simplePath = "color/" + variableName.split("/").pop();
    if (sourceVariableMap[simplePath]) {
      return sourceVariableMap[simplePath];
    }
  }

  return null;
}

// ===== LOCAL VARIABLE PROCESSING =====

function processLocalVariables(
  variablesToCreate,
  sourceCollection,
  targetCollection,
  existingVariables,
  modes,
  orphanedVariables
) {
  console.log("📁 Processing local variables...");

  // Remove orphaned variables first
  var removed = removeOrphanedVariables(orphanedVariables);

  // Get source variables
  var sourceVariables = figma.variables
    .getLocalVariables()
    .filter(function (v) {
      return v.variableCollectionId === sourceCollection.id;
    });

  console.log("📊 Source variables loaded:", sourceVariables.length);

  // Create variable map
  var sourceVariableMap = {};
  for (var i = 0; i < sourceVariables.length; i++) {
    sourceVariableMap[sourceVariables[i].name] = sourceVariables[i];
  }

  var created = [];
  var updated = [];
  var failed = [];

  // Process each variable
  for (var j = 0; j < variablesToCreate.length; j++) {
    var variable = variablesToCreate[j];

    try {
      console.log("🔄 Processing:", variable.variableName);

      // Find source variables
      var lightSourceVar = findSourceVariable(
        sourceVariableMap,
        variable.lightReference
      );
      var darkSourceVar = findSourceVariable(
        sourceVariableMap,
        variable.darkReference
      );

      if (!lightSourceVar || !darkSourceVar) {
        console.warn(
          "⚠️ Source variables not found for:",
          variable.variableName
        );
        failed.push({
          variableName: variable.variableName,
          lightReference: variable.lightReference,
          darkReference: variable.darkReference,
          error:
            (!lightSourceVar ? "Light" : "Dark") + " source variable not found",
        });
        continue;
      }

      // Get or create target variable
      var targetVariable = existingVariables[variable.variableName];
      var wasUpdated = !!targetVariable;

      if (!targetVariable) {
        console.log("➕ Creating new variable:", variable.variableName);
        targetVariable = figma.variables.createVariable(
          variable.variableName,
          targetCollection,
          "COLOR"
        );
        existingVariables[variable.variableName] = targetVariable;
      } else {
        console.log("🔄 Updating existing variable:", variable.variableName);
      }

      // Create aliases
      var lightAlias = figma.variables.createVariableAlias(lightSourceVar);
      var darkAlias = figma.variables.createVariableAlias(darkSourceVar);

      // Set values for modes
      targetVariable.setValueForMode(modes.lightModeId, lightAlias);
      targetVariable.setValueForMode(modes.darkModeId, darkAlias);

      console.log("✅ Success:", variable.variableName);

      // Record result
      var result = {
        variableName: variable.variableName,
        lightReference: variable.lightReference,
        darkReference: variable.darkReference,
        lightSourceVar: lightSourceVar.name,
        darkSourceVar: darkSourceVar.name,
      };

      if (wasUpdated) {
        updated.push(result);
      } else {
        created.push(result);
      }
    } catch (error) {
      console.error(
        "❌ Processing error for:",
        variable.variableName,
        error.message
      );
      failed.push({
        variableName: variable.variableName,
        lightReference: variable.lightReference,
        darkReference: variable.darkReference,
        error: error.message,
      });
    }
  }

  // Send results immediately for local processing
  sendResults(created, updated, failed, removed);
}

// ===== RESULTS =====

function sendResults(created, updated, failed, removed) {
  console.log("📊 === FINAL RESULTS ===");
  console.log("✅ Created:", created.length);
  console.log("🔄 Updated:", updated.length);
  console.log("🗑️ Removed:", removed.length);
  console.log("❌ Failed:", failed.length);

  if (created.length > 0) {
    console.log(
      "📋 Created variables:",
      created.map(function (v) {
        return v.variableName;
      })
    );
  }

  if (updated.length > 0) {
    console.log(
      "📋 Updated variables:",
      updated.map(function (v) {
        return v.variableName;
      })
    );
  }

  if (removed.length > 0) {
    console.log(
      "📋 Removed variables:",
      removed.map(function (v) {
        return v.variableName;
      })
    );
  }

  if (failed.length > 0) {
    console.log(
      "📋 Failed variables:",
      failed.map(function (v) {
        return v.variableName + " (" + v.error + ")";
      })
    );
  }

  figma.ui.postMessage({
    type: "creation-complete",
    success: failed.length === 0,
    message:
      failed.length === 0
        ? "Variables processed successfully"
        : "Processing completed with some errors",
    results: {
      created: created,
      updated: updated,
      failed: failed,
      removed: removed,
    },
  });
}
