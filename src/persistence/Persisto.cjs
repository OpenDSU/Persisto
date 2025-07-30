/*
 There 3 types of objects that can be configured:
  - normal model and the Persisto will have CRUD like functions for them automaticaly
  - index and groupings on the above models
  - digital assets objects are  objects that have a availableBalance and a lockedBalance, plus any other properties that are needed. For the creation
   of these objects and the management of their properties, dynamic functions are created based on configuration.
   Only the specified fields will be allowed
 */
const { convertToBase36Id } = require("./utils.cjs");

const AUDIT_EVENTS = {
    CREATE: "CREATE",
    UPDATE: "UPDATE",
    DELETE: "DELETE",
    CREATE_OBJECT: "CREATE_OBJECT"
}
// eslint-disable-next-line no-unused-vars
function Persisto(smartStorage, systemLogger, config) {
    let self = this;
    self.systemLogger = systemLogger;
    const primaryKeyFields = {};

    self.configureTypes = function (config) {
        for (let configKey in config) {
            addFunctionToSelf("create", configKey, "", getCreationFunction(configKey));
            addFunctionToSelf("update", configKey, "", async function (objectID, values) {
                //console.debug("Updating object of type " + configKey + " with ID " + objectID + " with values ", JSON.stringify(values));
                let obj = await getObjectFromIdOrKey(configKey, objectID);
                values = await smartStorage.preventIndexUpdate(configKey, values, obj);
                if (obj === undefined) {
                    await $$.throwError("Cannot update object of type " + configKey + " with ID " + objectID + ". Object not found");
                }

                // Store old data for join sync comparison
                let oldData = JSON.parse(JSON.stringify(obj));

                for (let key in values) {
                    if (key === "id") {
                        continue;
                    }
                    obj[key] = values[key];
                }
                await smartStorage.updateObject(obj.id, obj);
                await smartStorage.updateGrouping(configKey, obj.id);

                // Sync joins with array fields
                await self.syncJoinsWithArrays(configKey, obj.id, obj, oldData);

                return obj;
            });

            addFunctionToSelf("get", configKey, "", async function (objectID) {
                if (objectID === undefined) {
                    await $$.throwError("Object IDs must be defined. Cannot get object of type " + configKey + " with undefined ID");
                }
                return await getObjectFromIdOrKey(configKey, objectID);
            });

            addFunctionToSelf("has", configKey, "", async function (objectID) {
                if (objectID === undefined) {
                    await $$.throwError("Object IDs must be defined. Cannot get object of type " + configKey + " with undefined ID");
                }
                if (await smartStorage.objectExists(objectID)) {
                    return true;
                }
                return await smartStorage.keyExistInIndex(configKey, objectID);
            });

            addFunctionToSelf("delete", configKey, "", async function (objectID) {
                let obj = await getObjectFromIdOrKey(configKey, objectID);
                if (obj === undefined) {
                    await $$.throwError("Cannot delete object of type " + configKey + " with ID " + objectID + ". Object not found");
                }
                await smartStorage.removeFromGrouping(configKey, obj.id);
                await smartStorage.deleteObject(configKey, obj.id);
                await systemLogger.smartLog(AUDIT_EVENTS.DELETE, { configKey, objectID })
            })
        }
    }

    this.select = async function (typeName, filters = {}, options = {}) {
        // Extract options with defaults
        let {
            sortBy,
            start = 0,
            end,
            descending = false,
            pageSize
        } = options;

        // Handle pageSize for easier pagination
        if (pageSize && !end) {
            end = start + pageSize;
        }

        try {
            let result = await smartStorage.select(typeName, filters, sortBy, start, end, descending);

            // Add type information to result
            result.typeName = typeName;
            result.query = {
                filters: filters,
                sortBy: sortBy,
                start: start,
                end: end,
                descending: descending
            };

            return result;
        } catch (error) {
            await $$.throwError(error, `Error selecting objects of type ${typeName}`, "Filters:", JSON.stringify(filters), "Options:", JSON.stringify(options));
        }
    }

    const upCaseFirstLetter = name => name.replace(/^./, name[0].toUpperCase());

    function addFunctionToSelf(methodCategory, selfTypeName, name, func) {
        let funcName = methodCategory + upCaseFirstLetter(selfTypeName) + (name !== "" ? upCaseFirstLetter(name) : "");
        console.debug("Adding function " + funcName);
        if (self[funcName] !== undefined) {
            throw new Error("Function " + funcName + " already exists! Refusing to overwrite, change your configurations!");
        }
        self[funcName] = func.bind(self);
    }

    function addIndexFunctionToSelf(selfTypeName, fieldName, func) {
        let funcName = "get" + upCaseFirstLetter(selfTypeName) + "By" + upCaseFirstLetter(fieldName);
        console.debug("Adding function " + funcName);
        if (self[funcName] !== undefined) {
            throw new Error("Function " + funcName + " already exists! Refusing to overwrite, change your configurations!");
        }
        self[funcName] = func.bind(self);
    }

    async function nextObjectID(itemType) {
        let currentNumber = await smartStorage.getNextNumber(itemType);
        return convertToBase36Id(itemType, currentNumber);
    }

    this.getNextNumber = async function (itemType) {
        return await smartStorage.getNextNumber(itemType);
    }

    async function getObjectFromIdOrKey(itemType, objectID, allowMissing = false) {
        if (await smartStorage.objectExists(objectID)) {
            let prefix = itemType.slice(0, 6).toUpperCase();
            if (!objectID || !objectID.startsWith(prefix)) {
                if (allowMissing) {
                    return undefined;
                } else {
                    await $$.throwError("Object ID " + objectID + " does not start with expected prefix " + prefix + ". Cannot get object of type " + itemType);
                }
            }
            return await smartStorage.loadObject(objectID);
        }
        // try to treat the objectID as index value
        if (!await smartStorage.keyExistInIndex(itemType, objectID)) {
            if (allowMissing) {
                return undefined;
            }
            await $$.throwError("Object of type " + itemType + " with ID " + objectID + " not found");
        }
        return await smartStorage.getObjectByField(itemType, undefined, objectID, allowMissing);
    }

    function getCreationFunction(itemType) {
        return async function (initialValues) {
            //console.debug("|||||||| Creating new object '" + itemType + "' with values ", JSON.stringify(initialValues));
            if (await smartStorage.hasCreationConflicts(itemType, initialValues)) {
                throw new Error("Creation conflicts detected! Refusing to create object of type '" + itemType + "' with values " + JSON.stringify(initialValues));
            }

            let id = await nextObjectID(itemType);
            //console.debug("Creating object of type " + itemType + " with id " + id);
            let obj = {};
            if (initialValues !== undefined) {
                if (typeof initialValues !== "object") {
                    throw new Error("Initial values must be an object " + " for object of type " + itemType + " received " + typeof initialValues);
                }
                for (let property in initialValues) {
                    obj[property] = initialValues[property];
                }
            }
            //console.debug(">>>> Created object of type " + itemType + " with id " + id, JSON.stringify(obj));
            obj = await smartStorage.createObject(id, obj);
            await systemLogger.smartLog(AUDIT_EVENTS.CREATE_OBJECT, { itemType, id })
            await smartStorage.updateIndexedField(obj.id, itemType, undefined, undefined, undefined);
            await smartStorage.updateGrouping(itemType, obj.id);

            // Sync joins with array fields
            await self.syncJoinsWithArrays(itemType, obj.id, obj);

            return obj;
        }
    }


    this.getUserLogs = async function (userID) {
        return await systemLogger.getUserLogs(userID);
    }

    this.shutDown = async function () {
        return await smartStorage.shutDown();
    }

    this.forceSave = async function () {
        return await smartStorage.forceSave();
    }

    this.createIndex = async function (typeName, fieldName) {
        addIndexFunctionToSelf(typeName, fieldName, async function (value) {
            return await smartStorage.getObjectByField(typeName, fieldName, value);
        });

        primaryKeyFields[typeName] = fieldName;

        addFunctionToSelf("getEvery", typeName, "", async function () {
            return await smartStorage.getAllObjects(typeName);
        });
        addFunctionToSelf("getEvery", typeName, "Object", async function (sortBy, start = 0, end, descending = false) {
            return await smartStorage.getAllObjectsData(typeName, sortBy, start, end, descending);
        });

        addFunctionToSelf("set",
            upCaseFirstLetter(fieldName),
            "For" + upCaseFirstLetter(typeName),
            async function (objectId, value) {
                if (await smartStorage.hasCreationConflicts(typeName, { fieldName, value })) {
                    throw new Error("Index conflict detected! Refusing to update object of type " + typeName + " on key  " + fieldName + " and value " + value);
                }
                let obj = await getObjectFromIdOrKey(typeName, objectId);
                return await smartStorage.updateIndexedField(obj.id, typeName, fieldName, obj[fieldName], value);
            });

        addFunctionToSelf("getEvery", upCaseFirstLetter(typeName), upCaseFirstLetter(fieldName),
            async function () {
                return await smartStorage.getObjectsIndexValue(typeName);
            });
        return await smartStorage.createIndex(typeName, fieldName);
    }

    this.createGrouping = async function (groupingName, typeName, fieldName) {
        addIndexFunctionToSelf(groupingName, fieldName, async function (value) {
            return await smartStorage.getGroupingByField(groupingName, value);
        });
        addIndexFunctionToSelf(groupingName + "Objects", fieldName, async function (value, sortBy, start = 0, end, descending = false) {
            return await smartStorage.getGroupingObjectsByField(groupingName, value, sortBy, start, end, descending);
        });
        return await smartStorage.createGrouping(groupingName, typeName, fieldName);
    }

    this.createJoin = async function (joinName, leftType, rightType) {
        if (!self._joinConfigs) {
            self._joinConfigs = {};
        }

        let syncFields = {
            leftField: rightType,
            rightField: leftType
        };

        self._joinConfigs[joinName] = {
            leftType,
            rightType,
            syncFields
        };

        let leftToRightMethodName = "get" + upCaseFirstLetter(rightType) + "sFromJoinFor" + upCaseFirstLetter(leftType);
        self[leftToRightMethodName] = async function (leftId, sortBy, start = 0, end, descending = false) {
            return await smartStorage.getJoinedObjectsData(joinName, leftId, "left_to_right", sortBy, start, end, descending);
        };

        let rightToLeftMethodName = "get" + upCaseFirstLetter(leftType) + "sFromJoinFor" + upCaseFirstLetter(rightType);
        self[rightToLeftMethodName] = async function (rightId, sortBy, start = 0, end, descending = false) {
            return await smartStorage.getJoinedObjectsData(joinName, rightId, "right_to_left", sortBy, start, end, descending);
        };

        let leftToRightIdsMethodName = "get" + upCaseFirstLetter(rightType) + "IdsFromJoinFor" + upCaseFirstLetter(leftType);
        self[leftToRightIdsMethodName] = async function (leftId) {
            return await smartStorage.getJoinedObjects(joinName, leftId, "left_to_right");
        };

        let rightToLeftIdsMethodName = "get" + upCaseFirstLetter(leftType) + "IdsFromJoinFor" + upCaseFirstLetter(rightType);
        self[rightToLeftIdsMethodName] = async function (rightId) {
            return await smartStorage.getJoinedObjects(joinName, rightId, "right_to_left");
        };

        let removeJoinMethodName = "remove" + upCaseFirstLetter(leftType) + "FromJoinWith" + upCaseFirstLetter(rightType);
        self[removeJoinMethodName] = async function (leftId, rightId) {
            return await smartStorage.removeJoin(joinName, leftId, rightId);
        };

        console.debug(`Creating join ${joinName}: ${leftType} <-> ${rightType}`);
        console.debug(`Auto-sync fields configured for ${joinName}:`, syncFields);

        return await smartStorage.createJoin(joinName, leftType, rightType);
    }

    this.removeJoin = async function (joinName, leftId, rightId) {
        return await smartStorage.removeJoin(joinName, leftId, rightId);
    }

    this.getJoinedObjects = async function (joinName, objectId, direction, sortBy, start, end, descending) {
        return await smartStorage.getJoinedObjectsData(joinName, objectId, direction, sortBy, start, end, descending);
    }

    this.getLogicalTimestamp = async function () {
        return await smartStorage.getLogicalTimestamp();
    }

    this.syncJoinsWithArrays = async function (objectType, objectId, objectData, oldData = null) {
        if (!self._joinConfigs) {
            return;
        }

        for (let joinName in self._joinConfigs) {
            let joinConfig = self._joinConfigs[joinName];
            let { leftType, rightType, syncFields } = joinConfig;

            if (objectType !== leftType && objectType !== rightType) {
                continue;
            }

            if (!syncFields) {
                continue;
            }

            try {
                await self.processSyncFields(joinName, objectType, objectId, objectData, oldData, joinConfig);
            } catch (error) {
                console.error(`Error syncing arrays for join ${joinName}:`, error);
            }
        }
    }

    this.processSyncFields = async function (joinName, objectType, objectId, objectData, oldData, joinConfig) {
        let { leftType, rightType, syncFields } = joinConfig;
        let { leftField, rightField } = syncFields;

        let currentArray, fieldName;

        if (objectType === leftType && leftField) {
            currentArray = objectData[leftField] || [];
            fieldName = leftField;
        } else if (objectType === rightType && rightField) {
            currentArray = objectData[rightField] || [];
            fieldName = rightField;
        } else {
            return;
        }

        let oldArray = [];
        if (oldData && oldData[fieldName]) {
            oldArray = Array.isArray(oldData[fieldName]) ? oldData[fieldName] : [];
        }

        let currentSet = new Set(currentArray);
        let oldSet = new Set(oldArray);

        let additions = currentArray.filter(id => !oldSet.has(id));
        let removals = oldArray.filter(id => !currentSet.has(id));

        for (let targetId of additions) {
            if (objectType === leftType) {
                await smartStorage.addJoin(joinName, objectId, targetId);
                console.debug(`Synced join: Added ${leftType} ${objectId} to ${rightType} ${targetId}`);
            } else {
                await smartStorage.addJoin(joinName, targetId, objectId);
                console.debug(`Synced join: Added ${leftType} ${targetId} to ${rightType} ${objectId}`);
            }
        }

        for (let targetId of removals) {
            if (objectType === leftType) {
                await smartStorage.removeJoin(joinName, objectId, targetId);
                console.debug(`Synced join: Removed ${leftType} ${objectId} from ${rightType} ${targetId}`);
            } else {
                await smartStorage.removeJoin(joinName, targetId, objectId);
                console.debug(`Synced join: Removed ${leftType} ${targetId} from ${rightType} ${objectId}`);
            }
        }
    }
}

module.exports = {
    initialisePersisto: async function (elementStorageStrategy, logger) {
        console.debug(">>>>> Initialising persisto with elementStorageStrategy", elementStorageStrategy, "and logger", logger);
        let instance = new Persisto(elementStorageStrategy, logger);
        let assetsMixin = require("./AssetsMixin.cjs").getAssetsMixin(elementStorageStrategy, logger);
        let alreadyAdded = { "configureAssets": true };
        instance.configureAssets = async function (config) {
            await assetsMixin.configureAssets(config);
            for (let key in assetsMixin) {
                if (alreadyAdded[key]) {
                    continue;
                }
                if (instance[key]) {
                    await $$.throwError(`Key ${key} already exists in persisto` + JSON.stringify(alreadyAdded));
                }
                console.debug(">>>>> Adding function'", key, "'to persisto instance");
                instance[key] = assetsMixin[key];
                alreadyAdded[key] = true;
            }
        };
        return instance;
    }

}
