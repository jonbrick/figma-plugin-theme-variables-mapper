// Collection Variable Mapper - Create variable aliases from source to target collection
console.log("🔄 Collection Variable Mapper started");

figma.showUI(__html__, {
  width: 450,
  height: 600,
  title: "Collection Variable Mapper",
  themeColors: true,
});

figma.ui.onmessage = function (msg) {
  switch (msg.type) {
    case "get-collections":
      handleGetCollections();
      break;
    case "extract-variables":
      handleVariableExtraction(msg.collectionId);
      break;
    case "process-css-mapping":
      handleCSSMapping(
        msg.cssContent,
        msg.sourceCollectionId,
        msg.targetCollectionId
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
    // Get local collections first
    var localCollections = figma.variables.getLocalVariableCollections();
    var locals = [];

    for (var i = 0; i < localCollections.length; i++) {
      var collection = localCollections[i];
      locals.push({
        id: collection.id,
        name: collection.name,
        type: "local",
        variableCount: 0, // Will be updated after getting variables
        modeCount: collection.modes.length,
      });
    }

    console.log(
      "✅ Found " +
        locals.length +
        " local collection" +
        (locals.length !== 1 ? "s" : "")
    );

    // Get local variables for each collection
    figma.variables
      .getLocalVariablesAsync()
      .then(function (allLocalVariables) {
        // Process each local collection and log its variables
        for (var i = 0; i < locals.length; i++) {
          var collection = locals[i];
          var collectionVariables = allLocalVariables.filter(function (v) {
            return v.variableCollectionId === collection.id;
          });

          collection.variableCount = collectionVariables.length;

          console.log(
            "Processing variables for local collection:",
            collection.name,
            "(" + collectionVariables.length + ")",
            collectionVariables,
            "variables"
          );
        }

        // Now get library collections
        return figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
      })
      .then(function (libraryCollections) {
        console.log(
          "📚 Found " +
            libraryCollections.length +
            " library collection" +
            (libraryCollections.length !== 1 ? "s" : "")
        );

        var libraries = [];
        var libraryPromises = [];

        // Process each library collection
        for (var i = 0; i < libraryCollections.length; i++) {
          var collection = libraryCollections[i];

          // Create a promise for each library collection's variables
          var variablesPromise =
            figma.teamLibrary.getVariablesInLibraryCollectionAsync(
              collection.key
            );
          libraryPromises.push(
            variablesPromise.then(createLibraryProcessor(collection))
          );
        }

        // Wait for all library variable promises to resolve
        Promise.all(libraryPromises)
          .then(function (libraryResults) {
            // Filter out any failed results
            var validLibraries = libraryResults.filter(function (lib) {
              return lib !== null;
            });

            figma.ui.postMessage({
              type: "collections-loaded",
              success: true,
              libraries: validLibraries,
              locals: locals,
            });
          })
          .catch(function (error) {
            console.error("❌ Error processing library variables:", error);
            // Still send locals even if libraries fail
            figma.ui.postMessage({
              type: "collections-loaded",
              success: true,
              libraries: [],
              locals: locals,
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
          locals: locals,
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
        "Processing variables for library collection:",
        collection.name,
        "(" + variables.length + ")",
        variables,
        "variables"
      );

      return {
        id: collection.key,
        name: collection.name,
        libraryName: collection.libraryName || collection.name,
        type: "library",
        variableCount: variables.length,
      };
    } catch (error) {
      console.error(
        "Error processing library collection " + collection.name + ":",
        error
      );
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

function handleVariableExtraction(collectionId) {
  try {
    console.log("🔍 Starting variable extraction...");
    console.log("Collection ID: " + collectionId);

    // Get collection info and extract variables
    getCollectionInfoPromise(collectionId)
      .then(function (collectionInfo) {
        console.log("📊 Collection loaded for extraction");

        // Extract variable keys
        var variableMap = {};

        for (var i = 0; i < collectionInfo.variables.length; i++) {
          var variable = collectionInfo.variables[i];

          variableMap[variable.name] = {
            key: variable.key || variable.id,
            resolvedType: variable.resolvedType || variable.type,
          };
        }

        console.log("🎯 Variable extraction complete:");
        console.log("Collection:", collectionInfo.name);
        console.log("Variables extracted:", Object.keys(variableMap).length);
        console.log("Variable map:", variableMap);

        figma.ui.postMessage({
          type: "extraction-complete",
          success: true,
          data: variableMap,
          collection: collectionInfo,
        });
      })
      .catch(function (error) {
        console.error("❌ Variable extraction failed:", error.message);
        console.error(error.stack);
        figma.ui.postMessage({
          type: "extraction-complete",
          success: false,
          message: "Extraction failed: " + error.message,
        });
      });
  } catch (error) {
    console.error("❌ Variable extraction failed:", error.message);
    console.error(error.stack);
    figma.ui.postMessage({
      type: "extraction-complete",
      success: false,
      message: "Extraction failed: " + error.message,
    });
  }
}

function handleCSSMapping(cssContent, sourceCollectionId, targetCollectionId) {
  try {
    console.log("🎯 Variable mapping started");
    console.log("Source collection ID:", sourceCollectionId);
    console.log("Target collection ID:", targetCollectionId);
    console.log("CSS content length:", cssContent.length);

    // Direct parsing with strict validation - complete success or complete failure
    var directMappings = parseCSSTheme(cssContent);
    console.log("📋 Direct mappings created:", directMappings);
    console.log("Variables to create:", Object.keys(directMappings).length);

    // Get source collection info
    getCollectionInfoPromise(sourceCollectionId)
      .then(function (sourceCollection) {
        console.log("📊 Source collection loaded:", sourceCollection.name);

        // Get target collection info
        return Promise.all([
          Promise.resolve(sourceCollection),
          getCollectionInfoPromise(targetCollectionId),
        ]);
      })
      .then(function (collections) {
        var sourceCollection = collections[0];
        var targetCollection = collections[1];

        console.log("🎯 Target collection loaded:", targetCollection.name);

        // Create variable aliases with direct mappings
        return createDirectAliases(
          directMappings,
          sourceCollection,
          targetCollection
        );
      })
      .then(function (results) {
        console.log(
          "✅ Variable mapping complete:",
          results.created.length,
          "created,",
          results.failed.length,
          "failed"
        );
        console.log("📊 Detailed results:", results);

        figma.ui.postMessage({
          type: "mapping-complete",
          success: true,
          data: results,
        });
      })
      .catch(function (error) {
        console.error("❌ Variable mapping failed:", error.message);
        console.error(error.stack);
        figma.ui.postMessage({
          type: "mapping-complete",
          success: false,
          message: "Mapping failed: " + error.message,
        });
      });
  } catch (error) {
    // CSS parsing failed - immediate rejection
    console.error("❌ CSS parsing failed:", error.message);
    console.error(error.stack);
    figma.ui.postMessage({
      type: "mapping-complete",
      success: false,
      message: "CSS parsing failed: " + error.message,
    });
  }
}

function parseCSSTheme(cssContent) {
  try {
    console.log("📝 Parsing CSS content with strict validation...");

    // Strict validation - complete failure if any required block missing
    validateRequiredBlocks(cssContent);

    // Parse all blocks
    var themeVariables = extractThemeBlock(cssContent);
    console.log(
      "📋 Theme variables extracted:",
      Object.keys(themeVariables).length
    );

    var lightModeValues = extractModeValues(cssContent, "light");
    console.log(
      "☀️ Light mode values extracted:",
      Object.keys(lightModeValues).length
    );

    var darkModeValues = extractModeValues(cssContent, "dark");
    console.log(
      "🌙 Dark mode values extracted:",
      Object.keys(darkModeValues).length
    );

    // Connect directly - eliminate intermediate references
    var directMappings = {};

    for (var targetName in themeVariables) {
      var intermediate = themeVariables[targetName]; // "--fill-danger"
      console.log("🔗 Processing target:", targetName, "→", intermediate);

      var lightSource = lightModeValues[intermediate];
      var darkSource = darkModeValues[intermediate];

      // Strict validation - both modes required
      if (!lightSource) {
        throw new Error("Missing Light mode value for " + intermediate);
      }
      if (!darkSource) {
        throw new Error("Missing Dark mode value for " + intermediate);
      }

      // Translate CSS values to Figma variable names
      var lightFigmaName = translateToFigmaName(lightSource);
      var darkFigmaName = translateToFigmaName(darkSource);

      console.log("  📍 Light mode:", lightSource, "→", lightFigmaName);
      console.log("  📍 Dark mode:", darkSource, "→", darkFigmaName);

      directMappings[targetName] = {
        lightMode: lightFigmaName,
        darkMode: darkFigmaName,
      };
    }

    console.log(
      "✅ Direct CSS parsing complete:",
      Object.keys(directMappings).length,
      "variables connected"
    );
    return directMappings;
  } catch (error) {
    console.error("❌ CSS parsing failed:", error.message);
    throw error;
  }
}

function validateRequiredBlocks(cssContent) {
  console.log("🔍 Validating required CSS blocks...");

  if (!cssContent.includes("@theme inline")) {
    throw new Error("CSS must contain @theme inline block");
  }
  console.log("  ✅ @theme inline block found");

  if (!cssContent.includes(":root,") && !cssContent.includes(".light")) {
    throw new Error("CSS must contain :root or .light block");
  }
  console.log("  ✅ Light mode block found");

  if (!cssContent.includes(".dark")) {
    throw new Error("CSS must contain .dark block");
  }
  console.log("  ✅ Dark mode block found");
}

function extractThemeBlock(cssContent) {
  // Extract @theme inline block
  var themeMatch = cssContent.match(/@theme\s+inline\s*\{([^}]+)\}/);
  if (!themeMatch) {
    throw new Error("Could not parse @theme inline block");
  }

  var themeContent = themeMatch[1];
  console.log("📋 Theme block content extracted");

  // Parse variable mappings from theme block
  var mappings = {};
  var declarations = themeContent.split(";");

  for (var i = 0; i < declarations.length; i++) {
    var decl = declarations[i].trim();
    if (decl) {
      var colonIndex = decl.indexOf(":");
      if (colonIndex > 0) {
        var property = decl.substring(0, colonIndex).trim();
        var value = decl.substring(colonIndex + 1).trim();

        // Remove -- prefix and convert to Figma naming
        if (property.indexOf("--") === 0) {
          property = property.substring(2);
        }
        var targetName = property.replace(/-/g, "/");

        // Parse the value (should be var(--something))
        var intermediateVariable = parseVarReference(value);
        if (intermediateVariable) {
          // Convert intermediate to CSS format for mode lookup
          var cssIntermediate = "--" + intermediateVariable.replace(/\//g, "-");
          mappings[targetName] = cssIntermediate;
          console.log("  📌 Theme mapping:", targetName, "→", cssIntermediate);
        }
      }
    }
  }

  if (Object.keys(mappings).length === 0) {
    throw new Error("No valid variable mappings found in @theme block");
  }

  return mappings;
}

function extractModeValues(cssContent, mode) {
  var blockPattern;

  if (mode === "light") {
    // Match both ":root," and ".light" patterns
    blockPattern = /(?::root\s*,\s*\.light|\.light)\s*\{([^}]+)\}/;
  } else if (mode === "dark") {
    blockPattern = /\.dark\s*\{([^}]+)\}/;
  } else {
    throw new Error("Invalid mode: " + mode);
  }

  var blockMatch = cssContent.match(blockPattern);
  if (!blockMatch) {
    throw new Error("Could not find " + mode + " mode block");
  }

  var blockContent = blockMatch[1];
  console.log(
    "📋",
    mode.charAt(0).toUpperCase() + mode.slice(1),
    "mode block content extracted"
  );

  // Parse variable declarations from mode block
  var values = {};
  var declarations = blockContent.split(";");

  for (var i = 0; i < declarations.length; i++) {
    var decl = declarations[i].trim();
    if (decl) {
      var colonIndex = decl.indexOf(":");
      if (colonIndex > 0) {
        var property = decl.substring(0, colonIndex).trim();
        var value = decl.substring(colonIndex + 1).trim();

        // Keep CSS variable name as-is (--fill-danger)
        if (property.indexOf("--") === 0) {
          values[property] = value;
          console.log("  📌", mode, "value:", property, "→", value);
        }
      }
    }
  }

  return values;
}

function translateToFigmaName(cssValue) {
  // First check for --alpha syntax
  var alphaResult = parseAlphaFunction(cssValue);
  if (alphaResult) {
    return alphaResult;
  }

  // Regular var() reference
  var varResult = parseVarReference(cssValue);
  if (varResult) {
    return varResult;
  }

  console.warn("⚠️ Could not translate CSS value to Figma name:", cssValue);
  throw new Error("Invalid CSS variable reference: " + cssValue);
}

function parseVarReference(value) {
  // Parse: var(--something) - convert to Figma naming
  var varMatch = value.match(/var\s*\(\s*--([\w-]+)\s*\)/);
  if (varMatch) {
    var figmaVariableName = varMatch[1].replace(/-/g, "/"); // Convert CSS to Figma naming
    console.log("🔗 Variable reference:", value, "→", figmaVariableName);
    return figmaVariableName;
  }

  console.warn("⚠️ Could not parse variable reference:", value);
  return null;
}

function parseAlphaFunction(value) {
  // Parse: --alpha(var(--something) / 50%)
  var alphaMatch = value.match(
    /--alpha\s*\(\s*var\s*\(\s*--([\w-]+)\s*\)\s*\/\s*(\d+)%\s*\)/
  );
  if (alphaMatch) {
    var baseVariable = alphaMatch[1].replace(/-/g, "/");
    var opacity = parseInt(alphaMatch[2], 10);

    // Convert to Figma opacity naming
    var figmaVariableName = convertToFigmaOpacityName(baseVariable, opacity);
    console.log("🎨 Opacity conversion:", value, "→", figmaVariableName);
    return figmaVariableName;
  }

  return null;
}

function convertToFigmaOpacityName(baseVariable, opacity) {
  // Special case: 100% opacity - drop opacity completely
  if (opacity === 100) {
    return baseVariable;
  }

  // Handle special cases: black and white (no steps)
  if (baseVariable === "color/black") {
    return "color/black_" + formatOpacityForFigma(opacity);
  }
  if (baseVariable === "color/white") {
    return "color/white_" + formatOpacityForFigma(opacity);
  }

  // Regular color variables: color/red/700 → color/red/700_90
  return baseVariable + "_" + formatOpacityForFigma(opacity);
}

function formatOpacityForFigma(opacity) {
  // 5% → "05", 25% → "25", 90% → "90"
  if (opacity < 10) {
    return "0" + opacity.toString();
  }
  return opacity.toString();
}

function setupCollectionModes(collection) {
  console.log("🔧 Setting up collection modes for:", collection.name);

  var lightModeId = collection.defaultModeId;
  var darkModeId = null;
  var modes = collection.modes;

  console.log(
    "📊 Current modes:",
    modes.map(function (m) {
      return { name: m.name, id: m.modeId };
    })
  );

  if (modes.length === 1) {
    console.log("📝 Single mode detected, setting up Light/Dark modes...");
    // Only one mode, rename to Light and add Dark
    collection.renameMode(lightModeId, "Light");
    darkModeId = collection.addMode("Dark");
    console.log("✅ Created Light mode:", lightModeId);
    console.log("✅ Created Dark mode:", darkModeId);
  } else {
    console.log("📝 Multiple modes detected, finding Light and Dark...");
    // Multiple modes, find Light and Dark (case-insensitive)
    for (var i = 0; i < modes.length; i++) {
      var mode = modes[i];
      var modeName = mode.name.toLowerCase();
      console.log("  Checking mode:", mode.name, "->", modeName);

      // More flexible matching for light mode
      if (modeName.indexOf("light") !== -1 || modeName === "default") {
        lightModeId = mode.modeId;
        console.log("  ✅ Light mode found:", mode.name, "ID:", lightModeId);
      } else if (modeName.indexOf("dark") !== -1) {
        darkModeId = mode.modeId;
        console.log("  ✅ Dark mode found:", mode.name, "ID:", darkModeId);
      }
    }

    // Auto-create Dark mode if not found
    if (!darkModeId) {
      console.log("📝 Dark mode not found, creating one...");
      darkModeId = collection.addMode("Dark");
      console.log("✅ Created Dark mode:", darkModeId);
    }

    // Rename default mode to Light if needed
    if (lightModeId === collection.defaultModeId) {
      var defaultMode = modes.find(function (m) {
        return m.modeId === lightModeId;
      });
      if (defaultMode && defaultMode.name.toLowerCase() !== "light") {
        console.log("📝 Renaming default mode to Light...");
        collection.renameMode(lightModeId, "Light");
        console.log("✅ Renamed mode to Light");
      }
    }
  }

  var result = {
    lightModeId: lightModeId,
    darkModeId: darkModeId,
  };

  console.log("🎯 Final mode setup:", result);
  return result;
}

function createDirectAliases(
  directMappings,
  sourceCollection,
  targetCollection
) {
  return new Promise(function (resolve, reject) {
    console.log("🔨 Creating variable aliases with direct mappings...");
    console.log("Source collection:", sourceCollection.name);
    console.log("Target collection:", targetCollection.name);
    console.log(
      "Direct mappings to process:",
      Object.keys(directMappings).length
    );

    // Set up modes first
    var modeInfo = setupCollectionModes(targetCollection);
    console.log("Available modes:", modeInfo);

    var results = {
      created: [],
      overwritten: [],
      failed: [],
    };

    var promises = [];

    for (var targetName in directMappings) {
      var modeData = directMappings[targetName];

      // Pass modeInfo to createSingleDirectAlias
      var promise = createSingleDirectAlias(
        targetName,
        modeData,
        sourceCollection,
        targetCollection,
        modeInfo
      )
        .then(function (result) {
          if (result.success) {
            if (result.isNew) {
              results.created.push(result);
            } else {
              results.overwritten.push(result);
            }
          } else {
            results.failed.push(result);
          }
        })
        .catch(function (error) {
          results.failed.push({
            targetName: error.targetName,
            lightMode: error.lightMode,
            darkMode: error.darkMode,
            error: error.message,
          });
        });
      promises.push(promise);
    }

    Promise.all(promises)
      .then(function () {
        console.log("🎯 All direct alias creation attempts completed");
        resolve(results);
      })
      .catch(function (error) {
        console.error("❌ Error in batch direct alias creation:", error);
        reject(error);
      });
  });
}

function createSingleDirectAlias(
  targetName,
  modeData,
  sourceCollection,
  targetCollection,
  modeInfo
) {
  return new Promise(function (resolve, reject) {
    try {
      console.log(
        "🔍",
        targetName,
        "→",
        modeData.lightMode,
        "/",
        modeData.darkMode
      );

      // Check if we have the required modes
      if (!modeInfo.lightModeId || !modeInfo.darkModeId) {
        resolve({
          success: false,
          targetName: targetName,
          lightMode: modeData.lightMode,
          darkMode: modeData.darkMode,
          error: "Target collection missing required Light or Dark mode",
        });
        return;
      }

      // Find source variable keys
      var lightKey = getVariableKeyFromCollection(
        sourceCollection,
        modeData.lightMode
      );
      var darkKey = getVariableKeyFromCollection(
        sourceCollection,
        modeData.darkMode
      );

      if (!lightKey) {
        console.warn(
          "⚠️ Light mode source variable not found:",
          modeData.lightMode
        );
        resolve({
          success: false,
          targetName: targetName,
          lightMode: modeData.lightMode,
          darkMode: modeData.darkMode,
          error: "Light mode source variable not found: " + modeData.lightMode,
        });
        return;
      }

      if (!darkKey) {
        console.warn(
          "⚠️ Dark mode source variable not found:",
          modeData.darkMode
        );
        resolve({
          success: false,
          targetName: targetName,
          lightMode: modeData.lightMode,
          darkMode: modeData.darkMode,
          error: "Dark mode source variable not found: " + modeData.darkMode,
        });
        return;
      }

      // Import both source variables
      Promise.all([
        figma.variables.importVariableByKeyAsync(lightKey),
        figma.variables.importVariableByKeyAsync(darkKey),
      ])
        .then(function (sourceVariables) {
          var lightVariable = sourceVariables[0];
          var darkVariable = sourceVariables[1];

          console.log("📥", lightVariable.name, "+", darkVariable.name);

          // Check if target variable already exists
          var existingVariable = findVariableInCollection(
            targetCollection,
            targetName
          );
          var isNew = !existingVariable;

          if (isNew) {
            // For NEW variables - create with mode values
            var modeValues = {};
            modeValues[modeInfo.lightModeId] = {
              type: "VARIABLE_ALIAS",
              id: lightVariable.id,
            };
            modeValues[modeInfo.darkModeId] = {
              type: "VARIABLE_ALIAS",
              id: darkVariable.id,
            };

            // Create the variable with mode values
            figma.variables
              .createVariableAsync(
                targetName,
                targetCollection.id,
                lightVariable.resolvedType || "COLOR",
                modeValues
              )
              .then(function (newVariable) {
                console.log("✅", newVariable.name);
                resolve({
                  success: true,
                  targetName: targetName,
                  lightMode: modeData.lightMode,
                  darkMode: modeData.darkMode,
                  targetVariable: newVariable,
                  isNew: true,
                });
              })
              .catch(function (error) {
                console.error(
                  "❌ Failed to create variable with aliases:",
                  error
                );
                resolve({
                  success: false,
                  targetName: targetName,
                  lightMode: modeData.lightMode,
                  darkMode: modeData.darkMode,
                  error: "Failed to create variable: " + error.message,
                });
              });
          } else {
            // For EXISTING variables - use setVariableModeValueAsync
            Promise.all([
              figma.variables.setVariableModeValueAsync(
                existingVariable.id,
                modeInfo.lightModeId,
                {
                  type: "VARIABLE_ALIAS",
                  id: lightVariable.id,
                }
              ),
              figma.variables.setVariableModeValueAsync(
                existingVariable.id,
                modeInfo.darkModeId,
                {
                  type: "VARIABLE_ALIAS",
                  id: darkVariable.id,
                }
              ),
            ])
              .then(function () {
                console.log("✅ Updated", existingVariable.name);
                resolve({
                  success: true,
                  targetName: targetName,
                  lightMode: modeData.lightMode,
                  darkMode: modeData.darkMode,
                  targetVariable: existingVariable,
                  isNew: false,
                });
              })
              .catch(function (error) {
                console.error("❌ Failed to update variable aliases:", error);
                resolve({
                  success: false,
                  targetName: targetName,
                  lightMode: modeData.lightMode,
                  darkMode: modeData.darkMode,
                  error: "Failed to update aliases: " + error.message,
                });
              });
          }
        })
        .catch(function (error) {
          console.error(
            "❌ Failed to import source variables:",
            targetName,
            error.message
          );
          resolve({
            success: false,
            targetName: targetName,
            lightMode: modeData.lightMode,
            darkMode: modeData.darkMode,
            error: "Failed to import source variables: " + error.message,
          });
        });
    } catch (error) {
      console.error("❌ Error in createSingleDirectAlias:", error.message);
      reject({
        targetName: targetName,
        lightMode: modeData.lightMode,
        darkMode: modeData.darkMode,
        message: error.message,
      });
    }
  });
}

function getVariableKeyFromCollection(collection, variableName) {
  // Look up variable key by exact name match
  for (var i = 0; i < collection.variables.length; i++) {
    var variable = collection.variables[i];
    if (variable.name === variableName) {
      return variable.key || variable.id;
    }
  }
  return null;
}

function findVariableInCollection(collection, variableName) {
  // Find existing variable in collection by name
  for (var i = 0; i < collection.variables.length; i++) {
    var variable = collection.variables[i];
    if (variable.name === variableName) {
      return variable;
    }
  }
  return null;
}

function getCollectionInfoPromise(collectionId) {
  return new Promise(function (resolve, reject) {
    // Check if it's a local collection first
    var localCollections = figma.variables.getLocalVariableCollections();
    var localCollection = null;

    for (var i = 0; i < localCollections.length; i++) {
      if (localCollections[i].id === collectionId) {
        localCollection = localCollections[i];
        break;
      }
    }

    if (localCollection) {
      // It's a local collection
      try {
        figma.variables
          .getLocalVariablesAsync()
          .then(function (allLocalVariables) {
            var variables = allLocalVariables.filter(function (v) {
              return v.variableCollectionId === collectionId;
            });

            console.log("📍 Local collection variables:", variables);

            resolve({
              id: collectionId,
              name: localCollection.name,
              type: "local",
              modes: localCollection.modes,
              defaultModeId: localCollection.defaultModeId,
              variableCount: variables.length,
              variables: variables.map(function (v) {
                return convertVariableToExtractionFormat(v);
              }),
              // Pass through the collection methods we need
              addMode: localCollection.addMode.bind(localCollection),
              renameMode: localCollection.renameMode.bind(localCollection),
            });
          })
          .catch(function (error) {
            reject(
              new Error("Failed to get local variables: " + error.message)
            );
          });
      } catch (error) {
        reject(
          new Error("Failed to process local collection: " + error.message)
        );
      }
    } else {
      // It's a library collection
      console.log("📚 Loading library collection:", collectionId);

      var libraryVariablesPromise =
        figma.teamLibrary.getVariablesInLibraryCollectionAsync(collectionId);
      var libraryCollectionsPromise =
        figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();

      Promise.all([libraryVariablesPromise, libraryCollectionsPromise])
        .then(function (results) {
          var libraryVariables = results[0];
          var libraryCollections = results[1];

          console.log("📍 Library collection variables:", libraryVariables);

          var libraryCollection = null;
          for (var i = 0; i < libraryCollections.length; i++) {
            if (libraryCollections[i].key === collectionId) {
              libraryCollection = libraryCollections[i];
              break;
            }
          }

          resolve({
            id: collectionId,
            name: libraryCollection
              ? libraryCollection.name
              : "Unknown Library Collection",
            libraryName: libraryCollection
              ? libraryCollection.libraryName
              : "Unknown Library",
            type: "library",
            variableCount: libraryVariables.length,
            variables: libraryVariables.map(function (v) {
              return convertVariableToExtractionFormat(v);
            }),
          });
        })
        .catch(function (error) {
          reject(
            new Error(
              "Failed to load library collection " +
                collectionId +
                ": " +
                error.message
            )
          );
        });
    }
  });
}

function convertVariableToExtractionFormat(variable) {
  return {
    id: variable.id,
    key: variable.key || variable.id,
    name: variable.name,
    type: variable.type,
    resolvedType: variable.resolvedType || variable.type,
    description: variable.description || "",
    hidden: variable.hidden || false,
    scopes: variable.scopes || [],
  };
}
