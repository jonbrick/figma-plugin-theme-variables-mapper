// Figma Theme Variable Mapper - Maps CSS @theme variables to Figma variables with shared library references
//
// IMPORTANT NAMING CONVENTIONS:
// - Figma variables use forward slashes: color/red/500
// - CSS/Tailwind variables use hyphens with -- prefix: --color-red-500
// - This plugin converts between these two naming conventions

console.log("🚀 Theme Variables Mapper started");

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

function handleGetCollections() {
  try {
    console.log("📚 Loading all collections...");

    // Get local collections first
    var localCollections = figma.variables.getLocalVariableCollections();
    var locals = [];

    for (var i = 0; i < localCollections.length; i++) {
      var collection = localCollections[i];
      var variables = figma.variables.getLocalVariables().filter(function (v) {
        return v.variableCollectionId === collection.id;
      });

      locals.push({
        id: collection.id,
        name: collection.name,
        type: "local",
        variableCount: variables.length,
        modeCount: collection.modes.length,
      });
    }

    console.log("✅ Found " + locals.length + " local collections");

    // Get library collections using Promise-based approach - EXACTLY like the working alias logger
    var libraryCollectionsPromise =
      figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();

    libraryCollectionsPromise
      .then(function (libraryCollections) {
        console.log(
          "📚 Library collections promise resolved, found " +
            libraryCollections.length +
            " library collections"
        );

        var libraries = [];
        var libraryPromises = [];

        // Debug: Let's see what collections we actually found
        for (var i = 0; i < libraryCollections.length; i++) {
          var collection = libraryCollections[i];
          console.log("📋 Library collection " + i + ":", {
            name: collection.name,
            key: collection.key,
            libraryName: collection.libraryName,
          });
        }

        // Process each library collection
        for (var i = 0; i < libraryCollections.length; i++) {
          var collection = libraryCollections[i];
          console.log(
            "🔄 Processing library collection:",
            collection.name,
            "key:",
            collection.key
          );

          // Create a promise for each library collection's variables
          var variablesPromise =
            figma.teamLibrary.getVariablesInLibraryCollectionAsync(
              collection.key
            );
          libraryPromises.push(
            variablesPromise.then(createLibraryProcessor(collection))
          );
        }

        console.log(
          "⏳ Waiting for " +
            libraryPromises.length +
            " library promises to resolve..."
        );

        // Wait for all library variable promises to resolve
        Promise.all(libraryPromises)
          .then(function (libraryResults) {
            console.log(
              "📊 Library promises resolved, got " +
                libraryResults.length +
                " results"
            );

            // Debug: Let's see what we got back
            for (var i = 0; i < libraryResults.length; i++) {
              var result = libraryResults[i];
              if (result) {
                console.log("📋 Library result " + i + ":", {
                  name: result.name,
                  libraryName: result.libraryName,
                  variableCount: result.variableCount,
                  hasError: !!result.error,
                });
              } else {
                console.log("📋 Library result " + i + ": null");
              }
            }

            // Filter out any failed results
            var validLibraries = libraryResults.filter(function (lib) {
              return lib !== null;
            });

            console.log(
              "✅ Successfully processed " +
                validLibraries.length +
                " library collections out of " +
                libraryResults.length +
                " total"
            );

            figma.ui.postMessage({
              type: "collections-loaded",
              success: true,
              libraries: validLibraries,
              localCollections: locals,
            });
          })
          .catch(function (error) {
            console.error("❌ Error processing library variables:", error);
            console.error("Error stack:", error.stack);
            // Still send locals even if libraries fail
            figma.ui.postMessage({
              type: "collections-loaded",
              success: true,
              libraries: [],
              localCollections: locals,
              libraryError:
                "Failed to load library variables: " + error.message,
            });
          });
      })
      .catch(function (error) {
        console.error("❌ Error loading library collections:", error);
        // Send just locals if library loading fails completely
        figma.ui.postMessage({
          type: "collections-loaded",
          success: true,
          libraries: [],
          localCollections: locals,
          libraryError: "Failed to load library collections: " + error.message,
        });
      });
  } catch (error) {
    console.error("❌ Error in handleGetCollections:", error.message);
    figma.ui.postMessage({
      type: "collections-loaded",
      success: false,
      message: "Error loading collections: " + error.message,
    });
  }
}

// Helper function to create a closure for processing library collections
function createLibraryProcessor(collection) {
  return function (variables) {
    try {
      console.log(
        "🔧 Processing variables for library:",
        collection.name,
        "found",
        variables.length,
        "variables"
      );

      var result = {
        id: collection.key,
        name: collection.name,
        libraryName: collection.libraryName || collection.name,
        type: "library",
        variableCount: variables.length,
      };

      console.log("✅ Created library result:", result);
      return result;
    } catch (error) {
      console.error(
        "❌ Error processing library collection " + collection.name + ":",
        error
      );
      console.error("Error stack:", error.stack);
      return {
        id: collection.key,
        name: collection.name,
        libraryName: collection.libraryName || collection.name,
        type: "library",
        variableCount: 0,
        error: error.message,
      };
    }
  };
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
  selectedLibraryId,
  collectionChoice,
  existingCollectionId
) {
  try {
    console.log("🚀 Starting variable creation...");
    console.log("📊 Selected library ID:", selectedLibraryId);
    console.log("📊 Collection choice:", collectionChoice);
    console.log("📊 Variables to create:", variablesToCreate.length);

    var created = [];
    var updated = [];
    var failed = [];

    // Get library variables
    figma.teamLibrary
      .getVariablesInLibraryCollectionAsync(selectedLibraryId)
      .then(function (libraryVariables) {
        console.log(
          "📊 Found " +
            libraryVariables.length +
            " variables in selected library"
        );

        // Create map of library variables by name for easy lookup
        var libraryVariableMap = new Map();
        for (var i = 0; i < libraryVariables.length; i++) {
          var libVar = libraryVariables[i];
          libraryVariableMap.set(libVar.name, libVar);
          console.log(
            "📋 Library variable: " +
              libVar.name +
              " (ID: " +
              libVar.id +
              ", Key: " +
              libVar.key +
              ")"
          );
        }

        // Show sample of what we're looking for
        console.log("🔍 Sample search targets:");
        for (var i = 0; i < Math.min(3, variablesToCreate.length); i++) {
          var variable = variablesToCreate[i];
          console.log("  Looking for light: " + variable.lightReference);
          console.log("  Looking for dark: " + variable.darkReference);
        }

        // Get or create collection based on user choice
        var collection;
        if (collectionChoice === "new") {
          collection =
            figma.variables.createVariableCollection("Theme Variables");
          console.log("✅ Created new collection: " + collection.name);
        } else {
          collection =
            figma.variables.getVariableCollectionById(existingCollectionId);
          if (!collection) {
            throw new Error("Selected collection not found");
          }
          console.log("✅ Using existing collection: " + collection.name);
        }

        // Ensure we have light and dark modes
        var lightModeId = collection.defaultModeId;
        var darkModeId = null;

        var modes = collection.modes;
        if (modes.length === 1) {
          collection.renameMode(lightModeId, "Light");
          darkModeId = collection.addMode("Dark");
          console.log("✅ Created Light and Dark modes");
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
            darkModeId = collection.addMode("Dark");
            console.log("✅ Added Dark mode to existing collection");
          }
        }

        console.log(
          "🌓 Mode IDs - Light: " + lightModeId + ", Dark: " + darkModeId
        );

        // Get existing local variables in this collection
        var localVariables = figma.variables.getLocalVariables();
        var variableMap = new Map();
        for (var i = 0; i < localVariables.length; i++) {
          var localVar = localVariables[i];
          if (localVar.variableCollectionId === collection.id) {
            variableMap.set(localVar.name, localVar);
          }
        }

        console.log(
          "📊 Found " +
            variableMap.size +
            " existing variables in target collection"
        );

        // Process each variable to create
        for (var i = 0; i < variablesToCreate.length; i++) {
          var item = variablesToCreate[i];

          try {
            console.log("\n🔄 Processing variable: " + item.variableName);
            console.log("  Light ref: " + item.lightReference);
            console.log("  Dark ref: " + item.darkReference);

            // Find the library variables for light and dark modes
            var lightLibraryVar = libraryVariableMap.get(item.lightReference);
            var darkLibraryVar = libraryVariableMap.get(item.darkReference);

            if (!lightLibraryVar) {
              console.log(
                "❌ Light mode variable not found: " + item.lightReference
              );
              failed.push({
                variableName: item.variableName,
                lightReference: item.lightReference,
                darkReference: item.darkReference,
                error: "Light mode variable not found: " + item.lightReference,
              });
              continue;
            }

            if (!darkLibraryVar) {
              console.log(
                "❌ Dark mode variable not found: " + item.darkReference
              );
              failed.push({
                variableName: item.variableName,
                lightReference: item.lightReference,
                darkReference: item.darkReference,
                error: "Dark mode variable not found: " + item.darkReference,
              });
              continue;
            }

            console.log("✅ Found both library variables:");
            console.log(
              "  Light: " +
                lightLibraryVar.name +
                " (ID: " +
                lightLibraryVar.id +
                ")"
            );
            console.log(
              "  Dark: " +
                darkLibraryVar.name +
                " (ID: " +
                darkLibraryVar.id +
                ")"
            );

            // Check if variable already exists
            var newVariable = variableMap.get(item.variableName);
            var wasUpdated = false;

            if (newVariable) {
              wasUpdated = true;
              console.log(
                "🔄 Updating existing variable: " + item.variableName
              );
            } else {
              newVariable = figma.variables.createVariable(
                item.variableName,
                collection,
                "COLOR"
              );
              variableMap.set(item.variableName, newVariable);
              console.log("✨ Created new variable: " + item.variableName);
            }

            // Create variable aliases - this is the KEY part based on your analysis
            // The format should be: {"type":"VARIABLE_ALIAS","id":"VariableID:..."}
            var lightAlias = {
              type: "VARIABLE_ALIAS",
              id: lightLibraryVar.id,
            };

            var darkAlias = {
              type: "VARIABLE_ALIAS",
              id: darkLibraryVar.id,
            };

            console.log("🔗 Creating aliases:");
            console.log("  Light alias: " + JSON.stringify(lightAlias));
            console.log("  Dark alias: " + JSON.stringify(darkAlias));

            // Apply the alias values to the variable modes
            try {
              newVariable.setValueForMode(lightModeId, lightAlias);
              newVariable.setValueForMode(darkModeId, darkAlias);

              console.log(
                "✅ Successfully set alias values for " + item.variableName
              );

              var resultItem = {
                variableName: item.variableName,
                lightReference: item.lightReference,
                darkReference: item.darkReference,
                lightLibraryVar: lightLibraryVar.name,
                darkLibraryVar: darkLibraryVar.name,
              };

              if (wasUpdated) {
                updated.push(resultItem);
                console.log("✅ Updated: " + item.variableName);
              } else {
                created.push(resultItem);
                console.log("✅ Created: " + item.variableName);
              }
            } catch (aliasError) {
              console.log(
                "❌ Failed to set alias values for " +
                  item.variableName +
                  ": " +
                  aliasError.message
              );
              failed.push({
                variableName: item.variableName,
                lightReference: item.lightReference,
                darkReference: item.darkReference,
                error: "Failed to set alias values: " + aliasError.message,
              });
            }
          } catch (error) {
            console.error(
              "❌ Failed to process variable " +
                item.variableName +
                ": " +
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

        console.log("\n🎯 FINAL RESULTS:");
        console.log("✅ Created: " + created.length);
        console.log("🔄 Updated: " + updated.length);
        console.log("❌ Failed: " + failed.length);

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
      })
      .catch(function (error) {
        console.error("❌ Failed to load library variables:", error.message);
        figma.ui.postMessage({
          type: "creation-complete",
          success: false,
          message: "Failed to load library variables: " + error.message,
        });
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

    console.log("📋 Light mode mappings found: " + lightVars.size);
    console.log("📋 Dark mode mappings found: " + darkVars.size);

    // Match up variables that exist in both light and dark modes
    var themeVarEntries = Array.from(themeVars.entries());
    for (var i = 0; i < themeVarEntries.length; i++) {
      var entry = themeVarEntries[i];
      var varName = entry[0];
      var finalVarName = entry[1];

      if (lightVars.has(varName) && darkVars.has(varName)) {
        var lightRef = lightVars.get(varName);
        var darkRef = darkVars.get(varName);

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
  // Convert CSS variable name to Figma variable name
  // Example: --color-red-75 → color/red/75
  var figmaName = cssVariableName.startsWith("--")
    ? cssVariableName.substring(2)
    : cssVariableName;
  figmaName = figmaName.replace(/-/g, "/");

  if (!figmaName.startsWith("color/")) {
    figmaName = "color/" + figmaName;
  }

  return figmaName;
}
