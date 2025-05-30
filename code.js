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
var uploadedJsonData = null;
var detectedSentiment = null;
var selectedMode = "replace"; // Default mode

// ===== MAIN MESSAGE HANDLER =====
figma.ui.onmessage = function (msg) {
  console.log("📨 Received message:", msg.type);

  switch (msg.type) {
    case "get-collections":
      loadCollections();
      break;

    case "parse-css":
      parseCSSContent(msg.cssContent, msg.filename);
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
        msg.collectionChoice,
        msg.existingCollectionId
      );
      break;

    case "close-plugin":
      cleanupImportedVariables().then(function () {
        figma.closePlugin();
      });
      break;

    default:
      console.error("Unknown message type:", msg.type);
      cleanupImportedVariables();
  }
};

// ===== DETECT SENTIMENT FROM FILENAME =====
function detectSentimentFromFilename(filename) {
  if (!filename) return null;

  // Strict matching for standardized names
  var match = filename.match(
    /^(danger|warning|success|info|brand|neutral)\.css$/
  );
  return match ? match[1] : null;
}

// ===== CREATE COLLECTION INFO OBJECT =====
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

// ===== PROCESS LIBRARY COLLECTION =====
function processLibraryCollection(collection) {
  // Track imported variables for cleanup
  var importedVariableIds = [];

  // First get all variables from the library
  return figma.teamLibrary
    .getVariablesInLibraryCollectionAsync(collection.key)
    .then(function (variables) {
      // Try importing all variables to see if we get more
      var importPromises = variables.map(function (variable) {
        return figma.variables
          .importVariableByKeyAsync(variable.key)
          .then(function (imported) {
            if (imported && imported.id) {
              importedVariableIds.push(imported.id);
            }
            return {
              original: variable,
              imported: imported,
            };
          })
          .catch(function (error) {
            console.warn("Failed to import variable:", variable.name, error);
            return {
              original: variable,
              error: error,
            };
          });
      });

      return Promise.all(importPromises).then(function (results) {
        var successfulImports = results.filter(function (r) {
          return r.imported;
        });

        // Get all imported variables directly using their IDs
        var importedVars = importedVariableIds
          .map(function (id) {
            return figma.variables.getVariableById(id);
          })
          .filter(function (v) {
            return v !== null;
          });

        console.log(
          "📚 Library Collection Loaded: " +
            importedVars.length +
            " variables available"
        );

        // Store imported IDs for cleanup
        figma.clientStorage
          .setAsync("importedVariableIds", importedVariableIds)
          .catch(function (error) {
            console.warn("Failed to store imported IDs:", error);
          });

        var collectionInfo = createCollectionInfo(
          collection,
          importedVars,
          "library"
        );

        return collectionInfo;
      });
    })
    .catch(function (error) {
      console.error("❌ Error loading library " + collection.name + ":", error);
      return createCollectionInfo(collection, null, "library", error.message);
    });
}

// ===== CLEANUP IMPORTED VARIABLES =====
function cleanupImportedVariables() {
  return figma.clientStorage
    .getAsync("importedVariableIds")
    .then(function (ids) {
      if (!ids || !ids.length) {
        console.log("No imported variables to clean up.");
        return;
      }

      console.log(
        "🧹 Attempting to clean up",
        ids.length,
        "initially imported variables..."
      );
      var keptCount = 0;

      ids.forEach(function (id) {
        var variable = figma.variables.getVariableById(id);
        if (variable) {
          try {
            variable.remove();
          } catch (e) {
            if (
              e.message &&
              e.message.includes("Removing this node is not allowed")
            ) {
              // This is expected if the variable is now aliased
              keptCount++;
            } else {
              // Log other unexpected errors
              console.warn(
                "⚠️ Unexpected error during cleanup of variable ID " + id + ":",
                e.message
              );
            }
          }
        }
      });

      if (keptCount > 0) {
        console.log("ℹ️ Kept " + keptCount + " variables that are in use");
      }
      console.log("✅ Cleanup routine finished.");

      // Clear the stored IDs regardless, as we've attempted cleanup
      return figma.clientStorage.setAsync("importedVariableIds", []);
    })
    .catch(function (error) {
      // This catch is for errors with clientStorage itself
      console.warn("🚨 Error during clientStorage access in cleanup:", error);
    });
}

// ===== LOAD COLLECTIONS =====
function loadCollections() {
  try {
    console.log("📨 Loading collections...");

    // Get local collections synchronously
    var localCollections = figma.variables.getLocalVariableCollections();
    var localInfo = localCollections.map(function (collection) {
      var variables = figma.variables.getLocalVariables().filter(function (v) {
        return v.variableCollectionId === collection.id;
      });
      return createCollectionInfo(collection, variables, "local");
    });

    // Load library collections asynchronously
    figma.teamLibrary
      .getAvailableLibraryVariableCollectionsAsync()
      .then(function (libraryCollections) {
        // Process each library collection
        var libraryPromises = libraryCollections.map(function (collection) {
          return processLibraryCollection(collection);
        });

        // Wait for all library processing to complete
        return Promise.all(libraryPromises);
      })
      .then(function (libraryInfo) {
        // Filter out any failed loads
        var validLibraries = libraryInfo.filter(function (lib) {
          return lib !== null;
        });

        // Log detailed collection information
        console.log("📊 Collections:", {
          libraries: validLibraries.map(function (c) {
            return {
              id: c.id,
              displayName: c.displayName,
              libraryName: c.libraryName,
              collectionName: c.collectionName,
              variables: c.variableCount,
              modes: c.modeCount,
              type: c.type,
              lastModified: c.lastModified,
              description: c.description,
              error: c.error,
            };
          }),
          local: localInfo.map(function (c) {
            return {
              id: c.id,
              name: c.displayName,
              collectionName: c.collectionName,
              variables: c.variableCount,
              modes: c.modeCount,
              type: c.type,
              lastModified: c.lastModified,
              description: c.description,
            };
          }),
        });

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

// ===== PARSE CSS CONTENT =====
function parseCSSContent(cssContent, filename) {
  try {
    console.log("📄 Parsing CSS content...");
    console.log("📁 Filename:", filename);

    // Detect sentiment from filename
    var sentiment = detectSentimentFromFilename(filename);
    if (filename && !sentiment) {
      // Only validate if a filename was provided
      figma.ui.postMessage({
        type: "parsing-complete",
        success: false,
        message:
          "Filename must be one of: danger.css, warning.css, success.css, info.css, brand.css, or neutral.css",
      });
      return;
    }

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

    console.log("🎨 New variables:", {
      total: themeVariables.length,
      variables: themeVariables.map(function (v) {
        return v.variableName;
      }),
      sentiment: sentiment || "none",
    });

    // Send results to UI
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

// ===== EXTRACT @THEME VARIABLES FROM CSS =====
function extractThemeVariables(cssContent) {
  var themeVariables = [];
  var variableMap = {
    fill: {},
    stroke: {},
    a11y: {},
    symbol: {},
  };

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

    // Create mappings for variables that exist in theme, light, and dark
    for (var varName in themeVars) {
      if (lightVars[varName] && darkVars[varName]) {
        var finalVarName = themeVars[varName];
        var lightRef = convertCSSVariableToFigmaName(lightVars[varName]);
        var darkRef = convertCSSVariableToFigmaName(darkVars[varName]);

        // Find original theme mapping string
        var themeMapping = themeMatch[1].split(";").find(function (line) {
          return (
            line
              .trim()
              .indexOf(
                "--color-" +
                  finalVarName.replace(/color\//g, "").replace(/\//g, "-")
              ) === 0
          );
        });

        // Find original mode value strings
        var lightValue = lightMatch[1].split(";").find(function (line) {
          return line.trim().indexOf("--" + varName + ":") === 0;
        });
        var darkValue = darkMatch[1].split(";").find(function (line) {
          return line.trim().indexOf("--" + varName + ":") === 0;
        });

        var variable = {
          themeMapping: themeMapping ? themeMapping.trim() : "",
          lightValue: lightValue ? lightValue.trim() : "",
          darkValue: darkValue ? darkValue.trim() : "",
          variableName: finalVarName,
          lightReference: lightRef,
          darkReference: darkRef,
        };

        themeVariables.push(variable);

        // Store in categorized map
        var category = finalVarName.split("/")[1]; // fill, stroke, a11y, or symbol
        if (!variableMap[category]) {
          variableMap[category] = {};
        }
        variableMap[category][finalVarName] = variable;
      }
    }

    // Log final state with categorized theme variables
    console.log("📊 Theme Variables by Category:", variableMap);
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
      if (opacity.length === 1) {
        reference = reference + "_0" + opacity;
      } else {
        reference = reference + "_" + opacity;
      }
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
    console.log("Initial parameters:", {
      variablesToCreate: variablesToCreate.length,
      selectedSourceCollectionId: selectedSourceCollectionId,
      sourceCollectionType: sourceCollectionType,
      collectionChoice: collectionChoice,
      existingCollectionId: existingCollectionId,
      hasJsonData: uploadedJsonData ? "Yes" : "No",
      sentiment: detectedSentiment,
      mode: selectedMode,
    });

    // Initial context log
    var variablesList = [];
    for (var i = 0; i < variablesToCreate.length; i++) {
      var v = variablesToCreate[i];
      variablesList.push({
        name: v.variableName,
        light: v.lightReference,
        dark: v.darkReference,
      });
    }

    console.log("📊 Variable Creation Context:", {
      totalVariables: variablesToCreate.length,
      sourceId: selectedSourceCollectionId,
      sourceType: sourceCollectionType,
      targetId: existingCollectionId,
      hasJsonData: uploadedJsonData
        ? "Yes (" + Object.keys(uploadedJsonData).length + " variables)"
        : "No",
      sentiment: detectedSentiment,
      mode: selectedMode,
      variables: variablesList,
    });

    if (sourceCollection && sourceCollection.variableCount >= 500) {
      console.log(
        "⚡ Large source collection selected:",
        sourceCollection.displayName +
          " (" +
          sourceCollection.variableCount +
          " variables)"
      );
    }

    // Find source collection from our loaded data
    var sourceCollection = null;
    var targetCollection = null;

    // Use already-loaded collections from startup
    console.log("🎯 Using pre-loaded collections for variable creation");

    // Collections are already loaded and available - just process variables directly
    processVariables(
      variablesToCreate,
      selectedSourceCollectionId,
      sourceCollectionType,
      existingCollectionId,
      [], // created
      [], // updated
      [], // failed
      [] // removed
    );
  } catch (error) {
    console.error("❌ Variable Creation Error:", {
      error: error.message,
      stack: error.stack,
      context: {
        variableCount: variablesToCreate.length,
        sourceId: selectedSourceCollectionId,
        targetId: existingCollectionId,
      },
    });
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
  sourceCollection,
  targetCollection,
  sourceCollectionType,
  collectionChoice,
  created,
  updated,
  failed,
  removed
) {
  try {
    console.log("🎯 Starting processVariables...");
    // Get or create target collection
    var figmaTargetCollection = figma.variables.getVariableCollectionById(
      targetCollection.figmaId || targetCollection.id
    );

    if (!figmaTargetCollection) {
      console.error("❌ Target collection not found in Figma");
      throw new Error("Target collection not found in Figma");
    }
    console.log("✅ Found target collection:", figmaTargetCollection.name);

    // Setup modes
    console.log("🎨 Setting up collection modes...");
    var modes = setupCollectionModes(figmaTargetCollection);
    var lightModeId = modes.lightModeId;
    var darkModeId = modes.darkModeId;

    console.log("✅ Mode Configuration:", {
      light: lightModeId,
      dark: darkModeId,
      collection: figmaTargetCollection.name,
    });

    // Get existing variables in target collection
    var existingVariables = {};
    var localVariables = figma.variables.getLocalVariables();
    for (var i = 0; i < localVariables.length; i++) {
      var v = localVariables[i];
      if (v.variableCollectionId === figmaTargetCollection.id) {
        existingVariables[v.name] = v;
      }
    }

    console.log("📊 Existing Variables:", {
      count: Object.keys(existingVariables).length,
      names: Object.keys(existingVariables),
    });

    // Handle variable removal in Replace mode
    if (detectedSentiment && selectedMode === "replace") {
      var orphanedVariables = findOrphanedSentimentVariables(
        existingVariables,
        variablesToCreate,
        detectedSentiment
      );

      console.log("🗑️ Variable Removal Context:", {
        sentiment: detectedSentiment,
        mode: selectedMode,
        existingCount: Object.keys(existingVariables).length,
        cssVariableCount: variablesToCreate.length,
        candidatesForRemoval: orphanedVariables.length,
        orphanedVariables: orphanedVariables.map(function (v) {
          return {
            name: v.variableName,
            id: v.variable.id,
          };
        }),
      });

      if (orphanedVariables.length > 0) {
        console.log(
          "🗑️ Removing " + orphanedVariables.length + " orphaned variables..."
        );

        for (var j = 0; j < orphanedVariables.length; j++) {
          try {
            console.log("  → Removed:", orphanedVariables[j].variableName);
            orphanedVariables[j].variable.remove();
            removed.push({
              variableName: orphanedVariables[j].variableName,
            });
            // Remove from existingVariables so we don't try to update it
            delete existingVariables[orphanedVariables[j].variableName];
          } catch (error) {
            console.error(
              "  → Failed to remove:",
              orphanedVariables[j].variableName,
              error
            );
          }
        }

        console.log("✅ Removal complete");
      }
    }

    // Load source variables based on type
    if (sourceCollectionType === "library") {
      if (uploadedJsonData) {
        console.log("🚀 Using JSON data for variable lookup");
        console.log("JSON data size:", Object.keys(uploadedJsonData).length);
        processLibraryVariablesWithJson(
          variablesToCreate,
          uploadedJsonData,
          figmaTargetCollection,
          existingVariables,
          lightModeId,
          darkModeId,
          created,
          updated,
          failed,
          removed
        );
      } else {
        console.log("🐌 Using standard method for variable lookup");
        figma.teamLibrary
          .getVariablesInLibraryCollectionAsync(sourceCollection.id)
          .then(function (libraryVariables) {
            var libVarList = [];
            for (var i = 0; i < libraryVariables.length; i++) {
              libVarList.push({
                name: libraryVariables[i].name,
                key: libraryVariables[i].key,
              });
            }

            console.log("Library Variables:", {
              count: libraryVariables.length,
              variables: libVarList,
              sourceKey: sourceCollection.id,
            });

            // Create variable map
            var sourceVariableMap = {};
            for (var i = 0; i < libraryVariables.length; i++) {
              sourceVariableMap[libraryVariables[i].name] = libraryVariables[i];
            }

            // Process with loaded variables
            processLibraryVariables(
              variablesToCreate,
              sourceVariableMap,
              figmaTargetCollection,
              existingVariables,
              lightModeId,
              darkModeId,
              created,
              updated,
              failed,
              removed
            );
          })
          .catch(function (error) {
            console.error("Library Variable Loading Error:", {
              error: error.message,
              stack: error.stack,
              context: {
                sourceCollection: sourceCollection.id,
                variableCount: variablesToCreate.length,
              },
            });
            throw error;
          });
      }
    } else {
      console.log("📝 Processing local variables...");
      // Load local variables
      var sourceVariables = figma.variables
        .getLocalVariables()
        .filter(function (v) {
          return v.variableCollectionId === sourceCollection.id;
        });

      var localVarList = [];
      for (var i = 0; i < sourceVariables.length; i++) {
        localVarList.push({
          name: sourceVariables[i].name,
          id: sourceVariables[i].id,
        });
      }

      console.log("Local Variables:", {
        count: sourceVariables.length,
        variables: localVarList,
      });

      // Create variable map
      var sourceVariableMap = {};
      for (var i = 0; i < sourceVariables.length; i++) {
        sourceVariableMap[sourceVariables[i].name] = sourceVariables[i];
      }

      // Process with loaded variables
      processLocalVariables(
        variablesToCreate,
        sourceVariableMap,
        figmaTargetCollection,
        existingVariables,
        lightModeId,
        darkModeId,
        created,
        updated,
        failed,
        removed
      );

      sendResults(created, updated, failed, removed, variablesToCreate.length);
    }
  } catch (error) {
    console.error("❌ Variable Processing Error:", {
      error: error.message,
      stack: error.stack,
      context: {
        sourceCollection: sourceCollection.id,
        targetCollection: targetCollection.id,
        variableCount: variablesToCreate.length,
      },
    });
    figma.ui.postMessage({
      type: "creation-complete",
      success: false,
      message: "Error processing variables: " + error.message,
    });
  }
}

// ===== FIND ORPHANED SENTIMENT VARIABLES =====
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

  // Check existing variables
  for (var name in existingVariables) {
    if (sentimentPattern.test(name)) {
      if (!cssVariableNames[name]) {
        orphaned.push({
          variableName: name,
          variable: existingVariables[name],
        });
      }
    }
  }

  return orphaned;
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
  console.log("Processing Variables:", {
    total: variablesToCreate.length,
    type: "local",
  });

  for (var i = 0; i < variablesToCreate.length; i++) {
    var item = variablesToCreate[i];

    try {
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
      } else {
        created.push(result);
      }
    } catch (error) {
      failed.push({
        variableName: item.variableName,
        lightReference: item.lightReference,
        darkReference: item.darkReference,
        error: error.message,
      });
    }
  }
}

// ===== PROCESS LIBRARY VARIABLES WITH JSON =====

function processLibraryVariablesWithJson(
  variablesToCreate,
  jsonData,
  targetCollection,
  existingVariables,
  lightModeId,
  darkModeId,
  created,
  updated,
  failed,
  removed
) {
  console.log("🔄 Processing variables:", {
    total: variablesToCreate.length,
    variables: variablesToCreate.map(function (v) {
      return v.variableName;
    }),
    jsonVars: Object.keys(jsonData).length,
    targetCollection: targetCollection.name,
  });

  var promises = [];

  for (var i = 0; i < variablesToCreate.length; i++) {
    var item = variablesToCreate[i];

    var promise = processLibraryVariableWithJson(
      item,
      jsonData,
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

  Promise.all(promises)
    .then(function () {
      console.log("✅ JSON Processing Complete:", {
        created: created.length,
        updated: updated.length,
        failed: failed.length,
        removed: removed.length,
      });
      sendResults(created, updated, failed, removed, variablesToCreate.length);
    })
    .catch(function (error) {
      console.error("❌ JSON Processing Error:", error.message);
      sendResults(created, updated, failed, removed, variablesToCreate.length);
    });
}

function processLibraryVariableWithJson(
  item,
  jsonData,
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
      console.log("⚠️ Key not found:", {
        variable: item.variableName,
        lightFound: !!lightKey,
        darkFound: !!darkKey,
      });

      // Find variable keys in JSON data
      var lightKey = findVariableKeyInJson(jsonData, item.lightReference);
      var darkKey = findVariableKeyInJson(jsonData, item.darkReference);

      if (!lightKey || !darkKey) {
        console.warn("⚠️ Key not found:", {
          variable: item.variableName,
          lightFound: !!lightKey,
          darkFound: !!darkKey,
        });

        failed.push({
          variableName: item.variableName,
          lightReference: item.lightReference,
          darkReference: item.darkReference,
          error: !lightKey
            ? "Variable key not found in uploaded JSON file for light reference"
            : "Variable key not found in uploaded JSON file for dark reference",
        });
        resolve();
        return;
      }

      // Get or create target variable
      var targetVariable = existingVariables[item.variableName];
      var wasUpdated = !!targetVariable;

      if (!targetVariable) {
        console.log("🔄 Updating existing variable:", item.variableName);
        targetVariable = figma.variables.createVariable(
          item.variableName,
          targetCollection,
          "COLOR"
        );
        existingVariables[item.variableName] = targetVariable;
      } else {
        console.log("🔄 Updating existing variable:", item.variableName);
      }

      // Import library variables using keys from JSON
      var lightPromise = figma.variables.importVariableByKeyAsync(lightKey);
      var darkPromise =
        lightKey === darkKey
          ? lightPromise
          : figma.variables.importVariableByKeyAsync(darkKey);

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
            variableName: item.variableName,
            lightReference: item.lightReference,
            darkReference: item.darkReference,
            error: "Import failed: " + error.message,
          });
          resolve();
        });
    } catch (error) {
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

// ===== FIND VARIABLE KEY IN JSON DATA =====
function findVariableKeyInJson(jsonData, variableName) {
  // Normalize by removing _100 suffix if present
  var normalizedName = variableName.replace(/_100$/, "");

  // Handle stepless colors (like black and white) that don't have number steps
  if (isSteplessColor(normalizedName)) {
    // Check if someone is trying to use a step with black/white
    var parts = normalizedName.split("/");
    if (parts.length > 2) {
      console.warn("⚠️ Invalid stepless color pattern detected:", {
        original: normalizedName,
        parts: parts,
      });
      console.warn(
        'Colors "black" and "white" should be used without steps, e.g. "color/black" instead of "' +
          normalizedName +
          '"'
      );
    }

    // Ensure we have the simple color/name format
    var simplePath = "color/" + normalizedName.split("/").pop();
    console.log("🔄 Trying simplified path:", simplePath);

    if (jsonData[simplePath]) {
      return jsonData[simplePath].key;
    }
  }

  // Try exact match first
  if (jsonData[normalizedName]) {
    return jsonData[normalizedName].key;
  }

  // Try with/without color prefix
  var withPrefix = "color/" + normalizedName.replace(/^color\//, "");
  var withoutPrefix = normalizedName.replace(/^color\//, "");

  if (jsonData[withPrefix]) {
    return jsonData[withPrefix].key;
  }

  if (jsonData[withoutPrefix]) {
    return jsonData[withoutPrefix].key;
  }

  return null;
}

// Helper function to check if a color is stepless (black or white)
function isSteplessColor(name) {
  var colorName = name.split("/").pop().toLowerCase();
  return colorName === "black" || colorName === "white";
}

// ===== SEND RESULTS =====
function sendResults(created, updated, failed, removed, totalVariables) {
  console.log("📊 === FINAL RESULTS ===", {
    created: created.length,
    updated: updated.length,
    removed: removed.length,
    failed: failed.length,
    sentiment: detectedSentiment,
    mode: selectedMode,
    total: totalVariables,
    details: {
      createdVariables: created.slice(0, 5), // First 5 for preview
      removedVariables: removed,
      failedVariables: failed,
    },
  });

  figma.ui.postMessage({
    type: "creation-complete",
    success: failed.length === 0,
    message:
      failed.length === 0
        ? "Variables created successfully"
        : "Variable creation completed with errors",
    results: {
      created: created,
      updated: updated,
      failed: failed,
      removed: removed,
    },
  });
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
  console.log("Processing Library Variables:", {
    total: variablesToCreate.length,
    type: "library",
  });

  var importPromises = [];

  for (var i = 0; i < variablesToCreate.length; i++) {
    var item = variablesToCreate[i];

    try {
      // Find source variables
      var lightSourceVar = sourceVariableMap[item.lightReference];
      var darkSourceVar = sourceVariableMap[item.darkReference];

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

      // Create promise for importing variables
      var promise = importLibraryVariables(
        item,
        lightSourceVar,
        darkSourceVar,
        targetCollection,
        existingVariables,
        lightModeId,
        darkModeId,
        created,
        updated,
        failed
      );
      importPromises.push(promise);
    } catch (error) {
      failed.push({
        variableName: item.variableName,
        lightReference: item.lightReference,
        darkReference: item.darkReference,
        error: error.message,
      });
    }
  }

  // Wait for all imports to complete
  Promise.all(importPromises)
    .then(function () {
      console.log("Library imports completed");
      sendResults(created, updated, failed, removed, variablesToCreate.length);
    })
    .catch(function (error) {
      console.error("Library Import Error:", {
        error: error.message,
        stack: error.stack,
      });
      sendResults(created, updated, failed, removed, variablesToCreate.length);
    });
}

// ===== IMPORT LIBRARY VARIABLES =====
function importLibraryVariables(
  item,
  lightSourceVar,
  darkSourceVar,
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

      // Import light and dark variables
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
            variableName: item.variableName,
            lightReference: item.lightReference,
            darkReference: item.darkReference,
            error: "Import failed: " + error.message,
          });
          resolve();
        });
    } catch (error) {
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

  if (sourceVariableMap[withPrefix]) {
    return sourceVariableMap[withPrefix];
  }

  if (sourceVariableMap[withoutPrefix]) {
    return sourceVariableMap[withoutPrefix];
  }

  // Handle stepless colors (black/white)
  if (isSteplessColor(variableName)) {
    var simplePath = "color/" + variableName.split("/").pop();
    if (sourceVariableMap[simplePath]) {
      return sourceVariableMap[simplePath];
    }
  }

  return null;
}
