/*
 There 3 types of objects that can be configured:
  - normal model and the Persisto will have CRUD like functions for them automaticaly
  - index and collections on the above models
  - digital assets objects are  objects that have a availableBalance and a lockedBalance, plus any other properties that are needed. For the creation
   of these objects and the management of their properties, dynamic functions are created based on configuration.
   Only the specified fields will be allowed
 */
const {convertToBase36Id} = require("./utils");

const AUDIT_EVENTS = {
    CREATE: "CREATE",
    UPDATE: "UPDATE",
    DELETE: "DELETE",
    CREATE_OBJECT: "CREATE_OBJECT"
}
function Persisto(smartStorage, systemLogger, config) {
    let self = this;
    self.systemLogger = systemLogger;


    self.configureTypes = function (config) {
        for (let configKey in config) {
            addFunctionToSelf("create", configKey, "", getCreationFunction(configKey));
            addFunctionToSelf("update", configKey, "", async function (objectID, values) {
                let obj = await getObjectFromIdOrKey(configKey, objectID);
                values = await smartStorage.preventIndexUpdate(configKey, values, obj);
                if(obj === undefined){
                    await $$.throwError("Cannot update object of type " + configKey + " with ID " + objectID + ". Object not found");
                }
                for(let key in values){
                    if(key === "id"){
                        continue;
                    }
                    obj[key] = values[key];
                }
                await smartStorage.updateObject(obj.id, obj);
                await smartStorage.updateCollection(configKey, obj.id);
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
                if(await smartStorage.objectExists(objectID)){
                    return true;
                }
                return await smartStorage.keyExistInIndex(configKey, objectID);
            });
        }
    }

    const upCaseFirstLetter = name => name.replace(/^./, name[0].toUpperCase());


    function auditLog(eventName, forUser, ...args) {
        let details = args.concat(" ");
        if (forUser === undefined) {
            forUser = "system";
        }
        console.debug("AUDIT", forUser, eventName, details);

        systemLogger.log(forUser, eventName, details);
    }

    function addFunctionToSelf(methodCategory, selfTypeName, name, func) {
        let funcName = methodCategory + upCaseFirstLetter(selfTypeName) + (name !== "" ? upCaseFirstLetter(name) : "");
        console.debug("Adding function " + funcName);
        if (self[funcName] !== undefined) {
            throw new Error("Function " + funcName + " already exists! Refusing to overwrite, change your configurations!");
        }
        self[funcName] = func.bind(self);
    }

    function addIndexFunctionToSelf( selfTypeName, fieldName, func) {
        let funcName = "get" + upCaseFirstLetter(selfTypeName) + "By"+upCaseFirstLetter(fieldName);
        console.debug("Adding function " + funcName);
        if (self[funcName] !== undefined) {
            throw new Error("Function " + funcName + " already exists! Refusing to overwrite, change your configurations!");
        }
        self[funcName] = func.bind(self);
    }
    function nextObjectID(itemType) {
        let firstLetter = itemType[0].toUpperCase();
        let currentNumber = smartStorage.getNextObjectId();
        return convertToBase36Id(itemType, currentNumber);
    }

    async function getObjectFromIdOrKey(itemType, objectID, allowMissing = false) {
        if(await smartStorage.objectExists(objectID)){
            return await smartStorage.loadObject(objectID);
        }
        // try to treat the objectID as index value
        if(!await smartStorage.keyExistInIndex(itemType, objectID)){
            if(allowMissing){
                return undefined;
            }
            await $$.throwError("Object of type " + itemType + " with ID " + objectID + " not found");
        }
        return  await smartStorage.getObjectByField(itemType, undefined, objectID, allowMissing);
    }

    function getCreationFunction(itemType) {
        return async function (initialValues) {
            //console.debug("|||||||| Creating new object '" + itemType + "' with values ", JSON.stringify(initialValues));
            if(await smartStorage.hasCreationConflicts(itemType, initialValues)){
                throw new Error("Creation conflicts detected! Refusing to create object of type '" + itemType + "' with values " + JSON.stringify(initialValues));
            }
            let id = nextObjectID(itemType);
            let obj = {};
            if(initialValues !== undefined){
                if(typeof initialValues !== "object"){
                    throw new Error("Initial values must be an object " + " for object of type " + itemType + " received " + typeof initialValues);
                }
                for (let property in initialValues) {
                    obj[property] = initialValues[property];
                }
            }
            //console.debug(">>>> Created object of type " + itemType + " with id " + id, JSON.stringify(obj));
            obj = await smartStorage.createObject(id, obj);
            auditLog(AUDIT_EVENTS.CREATE_OBJECT, undefined, itemType, id, JSON.stringify(obj));
            await smartStorage.updateIndexedField(obj.id, itemType, undefined, undefined, undefined);
            await smartStorage.updateCollection(itemType, obj.id);
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


        addFunctionToSelf("getEvery", typeName, "", async function () {
            return await smartStorage.getAllObjects(typeName);
        });

        addFunctionToSelf("set",
                        upCaseFirstLetter(fieldName),
                  "For"+ upCaseFirstLetter(typeName),
                    async function (objectId, value) {
                            if(await smartStorage.hasCreationConflicts(typeName, {fieldName, value})){
                                throw new Error("Index conflict detected! Refusing to update object of type " + typeName + " on key  " + fieldName + " and value " + value);
                            }
                        let obj = await getObjectFromIdOrKey(typeName, objectId);
                        return await smartStorage.updateIndexedField(obj.id, typeName, fieldName, obj[fieldName], value);
                    });
        return await smartStorage.createIndex(typeName, fieldName);
    }

    this.createGrouping = async function (collectionName, typeName, fieldName) {
        addIndexFunctionToSelf(collectionName, fieldName, async function (value) {
            return await smartStorage.getCollectionByField(collectionName, value);
        });
        return await smartStorage.createGrouping(collectionName, typeName, fieldName);
    }

    this.getLogicalTimestamp = function () {
        return smartStorage.getLogicalTimestamp();
    }

}


module.exports = {
    initialisePersisto: async function (elementStorageStrategy, logger) {
        console.debug(">>>>> Initialising persisto with elementStorageStrategy", elementStorageStrategy, "and logger", logger);
        let instance = new Persisto(elementStorageStrategy, logger);
        let assetsMixin = require("./AssetsMixin.js").getAssetsMixin(elementStorageStrategy, logger);
        let alreadyAdded = {"configureAssets": true};
        instance.configureAssets = async function (config) {
            try{
                await assetsMixin.configureAssets(config);
            } catch(e){
               throw e;
            }
            for(let key in assetsMixin){
                if(alreadyAdded[key]){
                    continue;
                }
                if(instance[key]){
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