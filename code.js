// Figma Theme Variable Mapper - Maps CSS @theme variables to Figma variables with local collection references
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

// Load collections immediately when plugin starts
handleGetCollections();

figma.ui.onmessage = function (msg) {
  switch (msg.type) {
    case "parse-css":
      handleCSSParsing(msg.cssContent);
      break;
    case "get-collections":
      handleGetCollections();
      break;
    case "create-variables":
      handleVariableCreation(
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

function handleGetCollections() {
  try {
    console.log("📚 Loading collections...");

    // Load both library and local collections
    figma.teamLibrary
      .getAvailableLibraryVariableCollectionsAsync()
      .then(function (libraryCollections) {
        var localCollections = figma.variables.getLocalVariableCollections();

        // Process library collections
        var libraryPromises = [];

        for (var i = 0; i < libraryCollections.length; i++) {
          var collection = libraryCollections[i];
          libraryPromises.push(
            figma.teamLibrary
              .getVariablesInLibraryCollectionAsync(collection.key)
              .then(function (variables) {
                return {
                  collection: collection,
                  variables: variables,
                };
              })
              .catch(function (error) {
                return {
                  collection: collection,
                  variables: [],
                  error: error.message,
                };
              })
          );
        }

        Promise.all(libraryPromises).then(function (libraryResults) {
          // Process library results
          var libraryInfo = [];
          for (var i = 0; i < libraryResults.length; i++) {
            var result = libraryResults[i];
            var collection = result.collection;
            var variables = result.variables || [];

            libraryInfo.push({
              id: collection.key,
              name: collection.libraryName + " → " + collection.name,
              variableCount: variables.length,
              type: "library",
              libraryName: collection.libraryName,
              collectionName: collection.name,
              error: result.error,
            });
          }

          // Process local collections
          var localInfo = [];
          for (var i = 0; i < localCollections.length; i++) {
            var collection = localCollections[i];
            try {
              var variables = figma.variables
                .getLocalVariables()
                .filter(function (variable) {
                  return variable.variableCollectionId === collection.id;
                });

              localInfo.push({
                id: collection.id,
                name: collection.name + " (Local)",
                variableCount: variables.length,
                modeCount: collection.modes.length,
                type: "local",
              });
            } catch (error) {
              localInfo.push({
                id: collection.id,
                name: collection.name + " (Local)",
                variableCount: 0,
                modeCount: collection.modes.length,
                type: "local",
                error: error.message,
              });
            }
          }

          // Combine and sort all collections
          var allCollections = libraryInfo.concat(localInfo);
          allCollections.sort(function (a, b) {
            return a.name.localeCompare(b.name);
          });

          console.log(
            "✅ Found " +
              libraryInfo.length +
              " library collections and " +
              localInfo.length +
              " local collections"
          );

          figma.ui.postMessage({
            type: "collections-loaded",
            success: true,
            sourceCollections: allCollections,
            targetCollections: localInfo, // Only local collections can be targets
          });
        });
      })
      .catch(function (error) {
        console.error("❌ Error loading library collections:", error.message);

        // Fallback to local collections only
        var localCollections = figma.variables.getLocalVariableCollections();
        var localInfo = [];

        for (var i = 0; i < localCollections.length; i++) {
          var collection = localCollections[i];
          try {
            var variables = figma.variables
              .getLocalVariables()
              .filter(function (variable) {
                return variable.variableCollectionId === collection.id;
              });

            localInfo.push({
              id: collection.id,
              name: collection.name + " (Local)",
              variableCount: variables.length,
              modeCount: collection.modes.length,
              type: "local",
            });
          } catch (error) {
            localInfo.push({
              id: collection.id,
              name: collection.name + " (Local)",
              variableCount: 0,
              modeCount: collection.modes.length,
              type: "local",
              error: error.message,
            });
          }
        }

        figma.ui.postMessage({
          type: "collections-loaded",
          success: true,
          sourceCollections: localInfo,
          targetCollections: localInfo,
          warning: "Could not load library collections: " + error.message,
        });
      });
  } catch (error) {
    console.error("❌ Error loading collections:", error.message);
    figma.ui.postMessage({
      type: "collections-loaded",
      success: false,
      message: "Error loading collections: " + error.message,
    });
  }
}

function handleCSSParsing(cssContent) {
  try {
    console.log("📄 CSS uploaded - parsing variables...");

    // Validate that we received actual CSS content, not HTML
    if (!cssContent || typeof cssContent !== "string") {
      throw new Error("Invalid CSS content received");
    }

    if (cssContent.trim().startsWith("<")) {
      throw new Error("HTML content detected instead of CSS");
    }

    var themeVariables = extractThemeVariables(cssContent);

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
      "✅ Found " +
        themeVariables.length +
        " theme variables with light/dark modes"
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
      message: "Error parsing CSS: " + error.message,
    });
  }
}

function handleVariableCreation(
  variablesToCreate,
  selectedSourceCollectionId,
  sourceCollectionType,
  collectionChoice,
  existingCollectionId
) {
  try {
    console.log("🚀 Starting variable creation...");

    var created = [];
    var updated = [];
    var failed = [];

    // Get source collection variables (library or local)
    var sourceVariables = [];
    var sourceVariableMap = new Map();

    if (sourceCollectionType === "library") {
      // Handle library collection
      figma.teamLibrary
        .getVariablesInLibraryCollectionAsync(selectedSourceCollectionId)
        .then(function (libraryVariables) {
          console.log(
            "📊 Found " +
              libraryVariables.length +
              " variables in library collection"
          );

          // Create map of library variables
          for (var i = 0; i < libraryVariables.length; i++) {
            var variable = libraryVariables[i];
            sourceVariableMap.set(variable.name, variable);
          }

          processVariableCreation(
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
          console.error("❌ Failed to load library variables:", error.message);
          figma.ui.postMessage({
            type: "creation-complete",
            success: false,
            message: "Error loading library variables: " + error.message,
          });
        });
    } else {
      // Handle local collection
      var sourceCollection = figma.variables.getVariableCollectionById(
        selectedSourceCollectionId
      );
      if (!sourceCollection) {
        throw new Error("Source collection not found");
      }

      sourceVariables = figma.variables
        .getLocalVariables()
        .filter(function (variable) {
          return variable.variableCollectionId === selectedSourceCollectionId;
        });

      console.log(
        "📊 Found " + sourceVariables.length + " variables in local collection"
      );

      // Create map of local variables
      for (var i = 0; i < sourceVariables.length; i++) {
        var variable = sourceVariables[i];
        sourceVariableMap.set(variable.name, variable);
      }

      processVariableCreation(
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
    console.error("❌ Variable creation failed:", error.message);
    figma.ui.postMessage({
      type: "creation-complete",
      success: false,
      message: "Error creating variables: " + error.message,
    });
  }
}

function processVariableCreation(
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
    // Show ALL variable names so we can see the actual format
    var allKeys = Array.from(sourceVariableMap.keys()).sort();
    console.log("📋 First 20 source variables:", allKeys.slice(0, 20));
    console.log(
      '📋 Variables containing "red":',
      allKeys
        .filter(function (name) {
          return name.includes("red");
        })
        .slice(0, 10)
    );
    console.log(
      '📋 Variables containing "75":',
      allKeys
        .filter(function (name) {
          return name.includes("75");
        })
        .slice(0, 10)
    );

    // Get or create target collection based on user choice
    var targetCollection;
    if (collectionChoice === "new") {
      targetCollection =
        figma.variables.createVariableCollection("Theme Variables");
    } else {
      targetCollection =
        figma.variables.getVariableCollectionById(existingCollectionId);
      if (!targetCollection) {
        throw new Error("Selected target collection not found");
      }
    }

    // Ensure we have light and dark modes in target collection
    var lightModeId = targetCollection.defaultModeId;
    var darkModeId = null;

    var modes = targetCollection.modes;
    if (modes.length === 1) {
      targetCollection.renameMode(lightModeId, "Light");
      darkModeId = targetCollection.addMode("Dark");
    } else {
      for (var i = 0; i < modes.length; i++) {
        var mode = modes[i];
        if (mode.name.toLowerCase().includes("light")) {
          lightModeId = mode.modeId;
        } else if (mode.name.toLowerCase().includes("dark")) {
          darkModeId = mode.modeId;
        }
      }

      if (!darkModeId) {
        darkModeId = targetCollection.addMode("Dark");
      }
    }

    // Get existing local variables in target collection
    var localVariables = figma.variables.getLocalVariables();
    var variableMap = new Map();
    for (var i = 0; i < localVariables.length; i++) {
      var variable = localVariables[i];
      if (variable.variableCollectionId === targetCollection.id) {
        variableMap.set(variable.name, variable);
      }
    }

    for (var i = 0; i < variablesToCreate.length; i++) {
      var item = variablesToCreate[i];
      try {
        // Find the source variables for light and dark modes
        var lightSourceVar = findSourceVariable(
          sourceVariableMap,
          item.lightReference
        );
        var darkSourceVar = findSourceVariable(
          sourceVariableMap,
          item.darkReference
        );

        if (!lightSourceVar) {
          failed.push({
            variableName: item.variableName,
            lightReference: item.lightReference,
            darkReference: item.darkReference,
            error: "Light mode variable not found: " + item.lightReference,
          });
          continue;
        }

        if (!darkSourceVar) {
          failed.push({
            variableName: item.variableName,
            lightReference: item.lightReference,
            darkReference: item.darkReference,
            error: "Dark mode variable not found: " + item.darkReference,
          });
          continue;
        }

        console.log("🔍 Source variable analysis:", {
          lightVar: {
            name: lightSourceVar.name,
            id: lightSourceVar.id,
          },
          darkVar: {
            name: darkSourceVar.name,
            id: darkSourceVar.id,
          },
        });

        var newVariable = variableMap.get(item.variableName);
        var wasUpdated = false;

        if (newVariable) {
          wasUpdated = true;
        } else {
          newVariable = figma.variables.createVariable(
            item.variableName,
            targetCollection,
            "COLOR"
          );
          variableMap.set(item.variableName, newVariable);
        }

        // Create variable aliases (handle both library and local variables)
        var lightAlias, darkAlias;

        if (sourceCollectionType === "library") {
          // For library variables, we need to import them first
          var lightImportedVar = figma.variables.importVariableByKeyAsync(
            lightSourceVar.key
          );
          var darkImportedVar = figma.variables.importVariableByKeyAsync(
            darkSourceVar.key
          );

          Promise.all([lightImportedVar, darkImportedVar])
            .then(function (importedVars) {
              lightAlias = figma.variables.createVariableAlias(importedVars[0]);
              darkAlias = figma.variables.createVariableAlias(importedVars[1]);

              // Set the alias values
              newVariable.setValueForMode(lightModeId, lightAlias);
              newVariable.setValueForMode(darkModeId, darkAlias);
            })
            .catch(function (importError) {
              console.error(
                "❌ Failed to import library variables:",
                importError.message
              );
              failed.push({
                variableName: item.variableName,
                lightReference: item.lightReference,
                darkReference: item.darkReference,
                error:
                  "Failed to import library variables: " + importError.message,
              });
              return;
            });
        } else {
          // For local variables, create aliases directly
          lightAlias = figma.variables.createVariableAlias(lightSourceVar);
          darkAlias = figma.variables.createVariableAlias(darkSourceVar);

          // Set the alias values using the created aliases
          newVariable.setValueForMode(lightModeId, lightAlias);
          newVariable.setValueForMode(darkModeId, darkAlias);
        }

        console.log("🔗 Creating aliases:", {
          variable: item.variableName,
          lightAlias: lightAlias,
          darkAlias: darkAlias,
        });

        var resultItem = {
          variableName: item.variableName,
          lightReference: item.lightReference,
          darkReference: item.darkReference,
          lightSourceVar: lightSourceVar.name,
          darkSourceVar: darkSourceVar.name,
        };

        if (wasUpdated) {
          updated.push(resultItem);
        } else {
          created.push(resultItem);
        }

        console.log(
          "✅ " +
            (wasUpdated ? "Updated" : "Created") +
            " variable: " +
            item.variableName
        );
      } catch (error) {
        console.error(
          "❌ Failed to create variable " + item.variableName + ":",
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
      "✅ Complete: " +
        created.length +
        " created, " +
        updated.length +
        " updated, " +
        failed.length +
        " failed"
    );

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
          total: variablesToCreate.length,
        },
      },
    });
  } catch (error) {
    console.error("❌ Variable creation failed:", error.message);
    figma.ui.postMessage({
      type: "creation-complete",
      success: false,
      message: "Error creating variables: " + error.message,
    });
  }
}

function extractThemeVariables(cssContent) {
  var themeVariables = [];

  try {
    // Extract @theme section
    var themeRegex = /@theme[^{]*\{([^}]+)\}/;
    var themeMatch = cssContent.match(themeRegex);

    if (!themeMatch) {
      return [];
    }

    // Extract variable definitions from @theme
    var themeVarRegex = /--color-([^:]+):\s*var\(--([^)]+)\)/g;
    var themeVars = new Map();

    var match;
    while ((match = themeVarRegex.exec(themeMatch[1])) !== null) {
      var colorName = match[1];
      var varReference = match[2];
      themeVars.set(varReference, "color/" + colorName.replace(/-/g, "/"));
    }

    console.log("🎨 Found " + themeVars.size + " theme variables");

    // Extract light and dark mode definitions
    var lightMatch = cssContent.match(/(?::root|\.light)\s*\{([^}]+)\}/);
    var darkMatch = cssContent.match(/\.dark\s*\{([^}]+)\}/);

    if (!lightMatch || !darkMatch) {
      console.log("❌ Missing light or dark mode definitions");
      return [];
    }

    var lightVars = parseVariableDefinitions(lightMatch[1]);
    var darkVars = parseVariableDefinitions(darkMatch[1]);

    console.log("📋 Light mode mappings:");
    var lightEntries = Array.from(lightVars.entries());
    for (var i = 0; i < lightEntries.length; i++) {
      var varName = lightEntries[i][0];
      var reference = lightEntries[i][1];
      console.log("  " + varName + " → " + reference);
    }

    console.log("📋 Dark mode mappings:");
    var darkEntries = Array.from(darkVars.entries());
    for (var i = 0; i < darkEntries.length; i++) {
      var varName = darkEntries[i][0];
      var reference = darkEntries[i][1];
      console.log("  " + varName + " → " + reference);
    }

    // Match up variables that exist in both light and dark modes
    var lightEntries = Array.from(lightVars.entries());
    for (var i = 0; i < lightEntries.length; i++) {
      var varName = lightEntries[i][0];
      var lightRef = lightEntries[i][1];

      if (darkVars.has(varName) && themeVars.has(varName)) {
        var darkRef = darkVars.get(varName);
        var finalVarName = themeVars.get(varName);

        var lightFigmaRef = convertCSSVariableToFigmaName(lightRef);
        var darkFigmaRef = convertCSSVariableToFigmaName(darkRef);

        console.log("✅ Creating mapping: " + finalVarName);
        console.log("  Light: " + lightRef + " → " + lightFigmaRef);
        console.log("  Dark: " + darkRef + " → " + darkFigmaRef);

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

    console.log(
      "✅ Created " + themeVariables.length + " theme variable mappings"
    );
  } catch (error) {
    console.error("❌ Error in extractThemeVariables:", error);
  }

  return themeVariables;
}

function parseVariableDefinitions(cssBlock) {
  var variables = new Map();
  var varRegex =
    /--([^:]+):\s*(?:--alpha\(\s*)?var\(--([^)]+)\)(?:\s*\/\s*(\d+)%\s*\))?/g;

  var match;
  while ((match = varRegex.exec(cssBlock)) !== null) {
    var varName = match[1];
    var reference = match[2];
    var opacity = match[3];

    // If there's an opacity value, append it with underscore
    var finalReference = reference.trim();
    if (opacity) {
      finalReference = reference.trim() + "_" + opacity;
    }

    variables.set(varName.trim(), finalReference);
  }

  return variables;
}

function convertCSSVariableToFigmaName(cssVariableName) {
  console.log("🔄 Converting CSS variable to Figma name:");
  console.log("Input CSS variable:", cssVariableName);

  // Convert CSS variable name to Figma variable name
  // Example: --color-red-75 → color/red/75
  var figmaName = cssVariableName.startsWith("--")
    ? cssVariableName.substring(2)
    : cssVariableName;
  console.log("After removing -- prefix:", figmaName);

  figmaName = figmaName.replace(/-/g, "/");
  console.log("After replacing - with /:", figmaName);

  if (!figmaName.startsWith("color/")) {
    figmaName = "color/" + figmaName;
    console.log("After adding color/ prefix:", figmaName);
  }

  console.log("Final Figma name:", figmaName);
  return figmaName;
}

function findSourceVariable(sourceVariableMap, figmaVariableName) {
  console.log("🔍 Variable Search Debug:");
  console.log("Looking for:", figmaVariableName);

  // Log all variables containing "rose" for debugging
  var roseVars = Array.from(sourceVariableMap.keys()).filter(function (name) {
    return name.includes("rose");
  });
  console.log("All rose variables:", roseVars);

  // Log the exact format of the first few rose variables
  if (roseVars.length > 0) {
    console.log("Sample rose variable formats:");
    var sampleVars = roseVars.slice(0, 5);
    for (var i = 0; i < sampleVars.length; i++) {
      console.log('- "' + sampleVars[i] + '"');
    }
  }

  // Only try exact match - no variations
  if (sourceVariableMap.has(figmaVariableName)) {
    console.log("✅ Found exact match:", figmaVariableName);
    return sourceVariableMap.get(figmaVariableName);
  }

  console.log("❌ Not found:", figmaVariableName);
  return null;
}
