const process = require("process");
let fs = require("fs").promises;
let path = require("path");
//let coreUtils = require("../util/sopUtil.js");
const FILE_PATH_SEPARATOR = ".";

function SimpleFSStorageStrategy() {
    if(process.env.PERSISTENCE_FOLDER === undefined) {
        console.error("PERSISTENCE_FOLDER environment variable is not set. Please set it to the path where the logs should be stored. Defaults to './work_space_data/'");
        process.env.PERSISTENCE_FOLDER = "./work_space_data/"
    }

    fs.mkdir(process.env.PERSISTENCE_FOLDER, {recursive: true}).catch(console.error);

    this.init = async function(){
        try{
            await fs.mkdir(process.env.PERSISTENCE_FOLDER, {recursive: true});
        } catch (error) {
            console.error("Error creating folder", process.env.PERSISTENCE_FOLDER, error);
        }
    }

    function getFilePath(input){
        const regex = /^[a-zA-Z0-9_.]+$/;
        if (!regex.test(input)) {
            throw new Error("For security reasons only letters and numbers are allowed in object IDs!" + " Provided id is: " + input);
        }
        return path.join(process.env.PERSISTENCE_FOLDER, input);
    }

    this.loadObject = async function (id, allowMissing) {
        try{
            if(!id){
                await $$.throwError("An object identifier is required for loading!" + " Provided id is: " + id);
                return undefined;
            }
            const filePath = getFilePath(id);
            const data = await fs.readFile(filePath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            if(!allowMissing){
                await $$.throwError(error,`Error loading object with id [${id}]` , "Allow missing is:", typeof allowMissing, allowMissing, "Error is:");
            }
            return undefined;
        }
    }

    this.objectExists = async function (id) {

        try{
            const filePath = getFilePath(id);
            await fs.access(filePath);
            return true;
        } catch (error) {
            //console.debug(">>> Object with ID", id, "does not exist in file at path: " + getFilePath(id) + " " + error.message + " CWD is: " + process.cwd());
            return false;
        }
    }

    this.storeObject = async function (id, obj) {
        //console.debug(">>> Storing object with ID", id, "and value", obj);
        try {
            const filePath = getFilePath(id);
            await fs.writeFile(filePath, JSON.stringify(obj, null, 2), 'utf8');
        } catch (error) {
            await $$.throwError(error, `Error storing object [${id}] Error is:` + error.message);
        }
    };
    this.deleteObject = async function (id) {
        try {
            const filePath = getFilePath(id);
            await fs.unlink(filePath);
        } catch (error) {
            await $$.throwError(error, `Error deleting object [${id}] Error is:` + error.message);
        }
    }
}

function makeSpecialName(typeName, fieldName){
    return typeName + FILE_PATH_SEPARATOR + fieldName;
}

function AutoSaverPersistence(storageStrategy, periodicInterval) {
    this.storageStrategy = storageStrategy;
    let self = this;

    let cache = {};
    let modified = {};
    let alreadyInitialized  = false;

    this.init = async function(){
        if(alreadyInitialized){
            await $$.throwError(new Error("AutoSaverPersistence already initialised!"));
        }
        alreadyInitialized = true;
        let systemObject = await storageStrategy.loadObject("system", true);
        if(!systemObject || !systemObject.currentIDNumber === undefined){
            systemObject = await self.createObject("system", { currentIDNumber: 1, currentClockTick: 0});
        }
        cache["system"] = systemObject;
        //console.debug(">>> Initialised cache", cache);
    }

    this.getNextObjectId = function(){
        let systemObject = cache["system"];
        systemObject.currentIDNumber++;
        setForSave("system");
        return systemObject.currentIDNumber;
    }

    this.getLogicalTimestamp = function () {
        let systemObject = cache["system"];
        systemObject.currentClockTick++;
        setForSave("system");
        return systemObject.currentClockTick;
    }
    
    this.createObject = async function(id, obj) {
        if(!id){
            throw new Error("ID is required for creating an object!" + " provided ID: " + id);
        }
        cache[id] = await storageStrategy.loadObject(id, true);
        if(cache[id]){
            await $$.throwError(new Error("Object with ID " + id + " already exists!"));
        }
        cache[id] = obj;
        obj.id = id;
        setForSave(id);
        return obj;
    }
    async function loadWithCache(id, allowMissing= false){
        if(!cache[id]){
            cache[id] = await storageStrategy.loadObject(id, allowMissing);
        }
        return new Promise((resolve) => setImmediate(() => resolve(cache[id])));
    }

    function setForSave(id){
        //console.debug(">>> Set for save", id, "cache is", cache);
        modified[id] = true;
    }

    this.loadObject = async function (id, allowMissing= false) {
        return await loadWithCache(id, allowMissing);
    }

    this.objectExists = async function (id) {
        if(cache[id]){
            return true;
        }
        return await storageStrategy.objectExists(id);
    }

    this.getProperty = async function (id, key) {
        let obj = await loadWithCache(id);
        //console.debug(">>> Get property", key, "from", obj, "Current cache is", cache, "Value returned is ", obj[key]);
        return obj[key];
    }

    this.setProperty = this.updateProperty = async function (id, key, value) {
        let obj = await loadWithCache(id);
        obj[key] = value;
        //console.debug(">>> Update property", key, "from", obj, "Current cache is", cache);
        setForSave(id);
    }

    this.updateObject = async function (id, values) {
        let obj = await loadWithCache(id);
        for(let key in values){
            obj[key] = values[key];
        }
        //console.debug(">>> Update object", id, "with", values, "Current cache is", cache);
        setForSave(id);
    }

    let _indexes = {};
    let _groupings = {};

    this.preventIndexUpdate = async function (typeName, values, obj) {
        let indexFieldName = _indexes[typeName];
        if(typeof indexFieldName === "undefined"){
            return;
        }
        values[indexFieldName] = obj[indexFieldName];
        return values;
    }


    this.updateIndexedField = async function (id, typeName, fieldName, oldValue, newValue) {
        let obj = await loadWithCache(id);
        let indexFieldName = _indexes[typeName];
        if(!indexFieldName) {
            return ; //no index exists
        }
        else {
            if(!fieldName){
                fieldName = indexFieldName;
                oldValue = undefined;
                newValue = obj[fieldName];
            }
        }
        if(fieldName !== indexFieldName){
            await $$.throwError(new Error("Field " + fieldName + " is not indexed for type " + typeName));
        }

        //console.debug(">>> Updating field " + fieldName + " for type " + typeName + " from " + oldValue + " to " + newValue);
        if(oldValue === newValue){
             return; //nothing to do
        }

        let indexId = makeSpecialName(typeName, indexFieldName);
        let index = await loadWithCache(indexId);

        if(index.ids[newValue] !== undefined) {
            await $$.throwError(new Error("Index for field " + fieldName + " already exists for value " + newValue));
        }
        //console.debug(">>> Updating index" + fieldName + " for type " + typeName + " from " + oldValue + " to " + newValue);
        if(oldValue !== newValue){
            if(oldValue !== undefined){
                delete index.ids[oldValue];
            }
        }
        index.ids[newValue] = id;
        setForSave(indexId);
        obj[fieldName] = newValue;
        setForSave(id);
    }

    this.keyExistInIndex = async function (typeName, key) {
        let indexFieldName = _indexes[typeName];
        if(!indexFieldName) {
            return false; //no index exists, so key cannot exist
        }

        let indexId = makeSpecialName(typeName, indexFieldName);
        let index = await loadWithCache(indexId);
        //console.debug(">>> Checking if key exists in index", key, "for type", typeName, "index is", index);
        return index.ids[key] !== undefined;
    }

     this.updateGrouping = async function (typeName, objId) {
         let obj = await loadWithCache(objId);
         if(_groupings[typeName]){
             let groupingName = _groupings[typeName].groupingName;
             //console.debug(">>> Found grouping" + groupingName + " grouped by field " + _groupings[typeName].fieldName + " for type " + typeName);
             let fieldName = _groupings[typeName].fieldName;
             let grouping = await loadWithCache(groupingName);
             if(!grouping.items[obj[fieldName]]){
                 grouping.items[obj[fieldName]] = [];
             }
             if(grouping.items[obj[fieldName]].indexOf(objId) === -1){
                 grouping.items[obj[fieldName]].push(objId);
                 setForSave(groupingName);
             }
         }
     }
     this.deleteIndexedField = async function (objId, typeName) {
         let obj = await loadWithCache(objId);
         if(!obj){
             return;
         }
         let indexFieldName = _indexes[typeName]
         if(!indexFieldName){
             return;
         }
         let indexId = makeSpecialName(typeName, indexFieldName);
         let indexValue = obj[indexFieldName];
         let indexObj = await loadWithCache(indexId, true);
         if(!indexObj){
             return;
         }
         if(indexObj.ids[indexValue] !== undefined){
            delete indexObj.ids[indexValue];
            setForSave(indexId);
         }
     }
     this.deleteObject = async function (typeName, id) {
        await this.deleteIndexedField(id, typeName);
        delete cache[id];
        delete modified[id];
        await storageStrategy.deleteObject(id);
     }
     this.removeFromGrouping = async function (typeName, objId) {
         let obj = await loadWithCache(objId);
         if(_groupings[typeName]){
             let groupingName = _groupings[typeName].groupingName;
             let fieldName = _groupings[typeName].fieldName;
             let grouping = await loadWithCache(groupingName);
             if(!grouping.items[obj[fieldName]]){
                 return;
             }
             let index = grouping.items[obj[fieldName]].indexOf(objId);
             if(index !== -1){
                 grouping.items[obj[fieldName]].splice(index, 1);
                 if(grouping.items[obj[fieldName]].length === 0){
                    delete grouping.items[obj[fieldName]];
                 }
                 setForSave(groupingName);
             }
         }
     }

     this.hasCreationConflicts = async function(typeName, values){
         let indexFieldName = _indexes[typeName];
         if(indexFieldName){
             let indexId = makeSpecialName(typeName, indexFieldName);
             let index = await loadWithCache(indexId);
             if(index.ids[values[indexFieldName]] !== undefined){
                 console.debug(">>> Found conflict for type " + typeName, "with value", values[indexFieldName], "and in index ", index.ids[values[indexFieldName]]);
                 return true;
             }
         }
         return false;
     }

    this.createIndex = async function (typeName, fieldName) {
        if(_indexes[typeName]){
            await $$.throwError(new Error("Index for type " + typeName + " already exists!"));
        }
        _indexes[typeName] = fieldName;

        let objId = makeSpecialName(typeName ,fieldName);
        let obj = await loadWithCache(objId, true);
        if(!obj){
            await self.createObject(objId, { ids: {}});
            setForSave(objId);
        }
    }

    this.getAllObjects = async function (typeName) {
        let fieldName = _indexes[typeName];
        let objId = makeSpecialName(typeName, fieldName);
        let obj = await loadWithCache(objId);
        return Object.values(obj.ids);
    }

    this.getObjectByField = async function (typeName, fieldName, fieldValue, allowMissing) {
        if(!fieldName){
            fieldName = _indexes[typeName];
        }
        if(!fieldName){
          return undefined;
        }

        let objId = makeSpecialName(typeName, fieldName);
        let index = await loadWithCache(objId);
        let indexValueAsId = index.ids[fieldValue];
        if(indexValueAsId === undefined){
            return undefined;
        }
        return await self.loadObject(indexValueAsId, allowMissing);
    }

    this.createGrouping = async function (groupingName, typeName, fieldName) {
        if(_groupings[typeName]){
            await $$.throwError(new Error("Grouping for type " + typeName + " already exists!"));
        }
        _groupings[typeName] = {groupingName, fieldName};

        let obj = await loadWithCache(groupingName, true);
        if(!obj){
            await self.createObject(groupingName, { items: {}});
            setForSave(groupingName);
        }

    }

    this.getGroupingByField = async function (groupingName, fieldValue) {
        let grouping = await loadWithCache(groupingName);
        return grouping.items[fieldValue];
    }

    async function saveAll (){
        for(let id in modified){
            delete modified[id];
            await storageStrategy.storeObject(id, cache[id]);
        }
    }

    let intervalId = setInterval(async function(){
        await saveAll();
    }, periodicInterval);

    this.shutDown = async function(){
        clearInterval(intervalId);
        await saveAll();
    }

    this.forceSave = async function(){
        await saveAll();
    }
}

module.exports = {
    getAutoSaverPersistence: async function (storageStrategy) {
        if(!storageStrategy) {
            console.debug("No storage strategy provided, using SimpleFSStorageStrategy");
            storageStrategy = new SimpleFSStorageStrategy();
            await storageStrategy.init();
        }
        let autoSaver = new AutoSaverPersistence(storageStrategy);
        await autoSaver.init()
        return autoSaver;
    },
    getSimpleFSStorageStrategy: function () {
        return new SimpleFSStorageStrategy();
    }
};