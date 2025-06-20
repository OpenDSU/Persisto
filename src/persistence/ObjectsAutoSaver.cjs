let fs = require("fs").promises;
let path = require("path");
//let coreUtils = require("../util/sopUtil.js");
const FILE_PATH_SEPARATOR = ".";

function SimpleFSStorageStrategy() {
    if (process.env.PERSISTENCE_FOLDER === undefined) {
        console.error("PERSISTENCE_FOLDER environment variable is not set. Please set it to the path where the logs should be stored. Defaults to './work_space_data/'");
        process.env.PERSISTENCE_FOLDER = "./work_space_data/"
    }

    fs.mkdir(process.env.PERSISTENCE_FOLDER, { recursive: true }).catch(console.error);

    this.init = async function () {
        try {
            await fs.mkdir(process.env.PERSISTENCE_FOLDER, { recursive: true });
        } catch (error) {
            console.error("Error creating folder", process.env.PERSISTENCE_FOLDER, error);
        }
    }

    function getFilePath(input) {
        const regex = /^[a-zA-Z0-9_.]+$/;
        if (!regex.test(input)) {
            throw new Error("For security reasons only letters and numbers are allowed in object IDs!" + " Provided id is: " + input);
        }
        return path.join(process.env.PERSISTENCE_FOLDER, input);
    }

    this.loadObject = async function (id, allowMissing) {
        try {
            if (!id) {
                await $$.throwError("An object identifier is required for loading!" + " Provided id is: " + id);
                return undefined;
            }
            const filePath = getFilePath(id);
            const data = await fs.readFile(filePath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            if (!allowMissing) {
                await $$.throwError(error, `Error loading object with id [${id}]`, "Allow missing is:", typeof allowMissing, allowMissing, "Error is:");
            }
            return undefined;
        }
    }

    this.objectExists = async function (id) {
        try {
            const filePath = getFilePath(id);
            await fs.access(filePath);
            return true;
            // eslint-disable-next-line no-unused-vars
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
    this.getTimestamp = async function (id) {
        try {
            const filePath = getFilePath(id);
            const stats = await fs.stat(filePath);
            return stats.mtimeMs;
            // eslint-disable-next-line no-unused-vars
        } catch (error) {
            //await $$.throwError(error, `Error getting timestamp for object [${id}] Error is:` + error.message);
            return undefined;
        }
    }

    this.listAllObjects = async function () {
        try {
            const files = await fs.readdir(process.env.PERSISTENCE_FOLDER);
            return files.filter(file => {
                // Filter out hidden files and directories
                return !file.startsWith('.') && file.match(/^[a-zA-Z0-9_.]+$/);
            });
        } catch (error) {
            console.error("Error listing objects in folder", process.env.PERSISTENCE_FOLDER, error);
            return [];
        }
    }
}

function makeSpecialName(typeName, fieldName) {
    return typeName + FILE_PATH_SEPARATOR + fieldName;
}

function AutoSaverPersistence(storageStrategy, periodicInterval) {
    this.storageStrategy = storageStrategy;
    let self = this;

    if (!periodicInterval) {
        periodicInterval = 5000;
    }
    let cache = {};
    let timestampCache = {};
    let modified = {};
    let alreadyInitialized = false;

    this.init = async function () {
        if (alreadyInitialized) {
            await $$.throwError(new Error("AutoSaverPersistence already initialised!"));
        }
        alreadyInitialized = true;
        let systemObject = await storageStrategy.loadObject("system", true);
        if (!systemObject || !systemObject.currentIDNumber) {
            systemObject = await self.createObject("system", { currentIDNumber: 1, currentClockTick: 0 });
        }
        cache["system"] = systemObject;
        //console.debug(">>> Initialised cache", cache);
    }

    /*this.getNextObjectId = function () {
        let systemObject = cache["system"];
        systemObject.currentIDNumber++;
        setForSave("system");
        return systemObject.currentIDNumber;
    }*/

    this.getNextNumber = async function (itemType) {
        let systemObject = await loadWithCache("system");
        if (!itemType) {
            itemType = "default";
        }
        let nextNumber = systemObject[itemType];
        if (typeof nextNumber === "undefined") {
            nextNumber = 0;
        }
        nextNumber++;
        systemObject[itemType] = nextNumber;

        setForSave("system");
        return nextNumber;
    }


    this.getLogicalTimestamp = async function () {
        let systemObject = await loadWithCache("system");
        systemObject.currentClockTick++;
        setForSave("system");
        return systemObject.currentClockTick;
    }

    this.createObject = async function (id, obj) {
        if (!id) {
            throw new Error("ID is required for creating an object!" + " provided ID: " + id);
        }
        cache[id] = await storageStrategy.loadObject(id, true);
        if (cache[id]) {
            await $$.throwError(new Error("Object with ID " + id + " already exists!"));
        }
        cache[id] = obj;
        obj.id = id;
        setForSave(id);

        // Immediately save to storage to ensure we have a baseline for future updates
        await storageStrategy.storeObject(id, obj);
        // Update timestamp cache to prevent reload from storage
        timestampCache[id] = await storageStrategy.getTimestamp(id);

        return obj;
    }
    async function loadWithCache(id, allowMissing = false) {
        if (!cache[id]) {
            cache[id] = await storageStrategy.loadObject(id, allowMissing);
            timestampCache[id] = await storageStrategy.getTimestamp(id);
        } else {
            let currentTimestamp = await storageStrategy.getTimestamp(id);
            if (currentTimestamp !== undefined && timestampCache[id] !== currentTimestamp) {
                cache[id] = await storageStrategy.loadObject(id, allowMissing);
                timestampCache[id] = currentTimestamp;
            }
        }

        return cache[id];
    }

    function setForSave(id) {
        //console.debug(">>> Set for save", id, "cache is", cache);
        modified[id] = true;
    }

    this.loadObject = async function (id, allowMissing = false) {
        return await loadWithCache(id, allowMissing);
    }

    this.objectExists = async function (id) {
        if (cache[id]) {
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

    this.updateGroupingForFieldChange = async function (typeName, objId, fieldName, oldValue, newValue) {
        let allGroupings = _groupings[typeName];
        if (!allGroupings || allGroupings.length === 0) {
            return;
        }

        for (let i = 0; i < allGroupings.length; i++) {
            let groupingName = allGroupings[i].groupingName;
            let groupingFieldName = allGroupings[i].fieldName;

            // Only process if this grouping is for the field that changed
            if (groupingFieldName === fieldName) {
                let grouping = await loadWithCache(groupingName);

                // Remove from old value's grouping (if oldValue exists)
                if (oldValue !== undefined && grouping.items[oldValue]) {
                    let index = grouping.items[oldValue].indexOf(objId);
                    if (index !== -1) {
                        grouping.items[oldValue].splice(index, 1);
                        if (grouping.items[oldValue].length === 0) {
                            delete grouping.items[oldValue];
                        }
                        setForSave(groupingName);
                    }
                }

                // Add to new value's grouping (if newValue exists)
                if (newValue !== undefined) {
                    if (!grouping.items[newValue]) {
                        grouping.items[newValue] = [];
                    }
                    if (grouping.items[newValue].indexOf(objId) === -1) {
                        grouping.items[newValue].push(objId);
                        setForSave(groupingName);
                    }
                }
            }
        }
    }

    this.updateObject = async function (id, values) {
        let obj = await loadWithCache(id);

        // get the original values from storage to detect changes
        let originalObj = await storageStrategy.loadObject(id, true);
        if (!originalObj) {
            // If no storage version exists, we can't detect changes
            // This can happen for objects created through alternative paths
            originalObj = JSON.parse(JSON.stringify(obj));
        }

        // Check for grouping field changes by comparing with original storage values
        for (let key in values) {
            if (originalObj[key] !== values[key]) {
                // Check if this field change affects any groupings
                for (let typeName in _groupings) {
                    let allGroupings = _groupings[typeName];
                    if (allGroupings && allGroupings.length > 0) {
                        for (let i = 0; i < allGroupings.length; i++) {
                            let fieldName = allGroupings[i].fieldName;
                            if (fieldName === key) {
                                let oldValue = originalObj[key];
                                let newValue = values[key];
                                await this.updateGroupingForFieldChange(typeName, id, fieldName, oldValue, newValue);
                            }
                        }
                    }
                }
            }
            obj[key] = values[key];
        }

        setForSave(id);
    }

    let _indexes = {};
    let _groupings = {};

    this.preventIndexUpdate = async function (typeName, values, obj) {
        let indexFieldName = _indexes[typeName];
        if (typeof indexFieldName === "undefined") {
            return values;
        }
        values[indexFieldName] = obj[indexFieldName];
        return values;
    }


    this.updateIndexedField = async function (id, typeName, fieldName, oldValue, newValue) {
        let obj = await loadWithCache(id);
        let indexFieldName = _indexes[typeName];
        if (!indexFieldName) {
            return; //no index exists
        }
        else {
            if (!fieldName) {
                fieldName = indexFieldName;
                oldValue = undefined;
                newValue = obj[fieldName];
            }
        }
        if (fieldName !== indexFieldName) {
            await $$.throwError(new Error("Field " + fieldName + " is not indexed for type " + typeName));
        }

        //console.debug(">>> Updating field " + fieldName + " for type " + typeName + " from " + oldValue + " to " + newValue);
        if (oldValue === newValue) {
            return; //nothing to do
        }

        let indexId = makeSpecialName(typeName, indexFieldName);
        let index = await loadWithCache(indexId);

        if (index.ids[newValue] !== undefined) {
            await $$.throwError(new Error("Index for field " + fieldName + " already exists for value " + newValue));
        }
        //console.debug(">>> Updating index" + fieldName + " for type " + typeName + " from " + oldValue + " to " + newValue);
        if (oldValue !== newValue) {
            if (oldValue !== undefined) {
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
        if (!indexFieldName) {
            return false; //no index exists, so key cannot exist
        }

        let indexId = makeSpecialName(typeName, indexFieldName);
        let index = await loadWithCache(indexId);
        //console.debug(">>> Checking if key exists in index", key, "for type", typeName, "index is", index);
        return index.ids[key] !== undefined;
    }
    this.getObjectsIndexValue = async function (typeName) {
        let indexFieldName = _indexes[typeName];
        if (!indexFieldName) {
            return undefined; //no index exists, so key cannot exist
        }

        let indexId = makeSpecialName(typeName, indexFieldName);
        let index = await loadWithCache(indexId);
        //console.debug(">>> Getting objects for key", key, "in index", typeName, "index is", index);
        return Object.keys(index.ids)
    }

    this.updateGrouping = async function (typeName, objId) {
        let obj = await loadWithCache(objId);
        let allGroupings = _groupings[typeName];
        if (allGroupings && allGroupings.length !== 0) {
            for (let i = 0; i < allGroupings.length; i++) {
                let groupingName = allGroupings[i].groupingName;
                //console.debug(">>> Found grouping" + groupingName + " grouped by field " + _groupings[typeName].fieldName + " for type " + typeName);
                let fieldName = allGroupings[i].fieldName;
                let grouping = await loadWithCache(groupingName);
                if (!grouping.items[obj[fieldName]]) {
                    grouping.items[obj[fieldName]] = [];
                }
                if (grouping.items[obj[fieldName]].indexOf(objId) === -1) {
                    grouping.items[obj[fieldName]].push(objId);
                    setForSave(groupingName);
                }
            }
        }
    }
    this.deleteIndexedField = async function (objId, typeName) {
        let obj = await loadWithCache(objId);
        if (!obj) {
            return;
        }
        let indexFieldName = _indexes[typeName]
        if (!indexFieldName) {
            return;
        }
        let indexId = makeSpecialName(typeName, indexFieldName);
        let indexValue = obj[indexFieldName];
        let indexObj = await loadWithCache(indexId, true);
        if (!indexObj) {
            return;
        }
        if (indexObj.ids[indexValue] !== undefined) {
            delete indexObj.ids[indexValue];
            setForSave(indexId);
        }
    }
    this.deleteObject = async function (typeName, id) {
        await this.deleteIndexedField(id, typeName);
        delete cache[id];
        delete modified[id];
        if (await storageStrategy.objectExists(id)) {
            await storageStrategy.deleteObject(id);
        }
    }
    this.removeFromGrouping = async function (typeName, objId) {
        let obj = await loadWithCache(objId);
        let myGroupings = _groupings[typeName];
        if (myGroupings && myGroupings.length !== 0) {
            for (let i = 0; i < myGroupings.length; i++) {
                let groupingName = myGroupings[i].groupingName;
                let fieldName = myGroupings[i].fieldName;
                let grouping = await loadWithCache(groupingName);
                if (!grouping.items[obj[fieldName]]) {
                    return;
                }
                let index = grouping.items[obj[fieldName]].indexOf(objId);
                if (index !== -1) {
                    grouping.items[obj[fieldName]].splice(index, 1);
                    if (grouping.items[obj[fieldName]].length === 0) {
                        delete grouping.items[obj[fieldName]];
                    }
                    setForSave(groupingName);
                }
            }
        }
    }

    this.hasCreationConflicts = async function (typeName, values) {
        let indexFieldName = _indexes[typeName];
        if (indexFieldName) {
            let indexId = makeSpecialName(typeName, indexFieldName);
            let index = await loadWithCache(indexId);
            if (index.ids[values[indexFieldName]] !== undefined) {
                console.debug(">>> Found conflict for type " + typeName, "with value", values[indexFieldName], "and in index ", index.ids[values[indexFieldName]]);
                return true;
            }
        }
        return false;
    }

    this.createIndex = async function (typeName, fieldName) {
        if (_indexes[typeName]) {
            await $$.throwError(new Error("Index for type " + typeName + " already exists!"));
        }
        _indexes[typeName] = fieldName;

        let objId = makeSpecialName(typeName, fieldName);
        let obj = await loadWithCache(objId, true);
        if (!obj) {
            obj = await self.createObject(objId, { ids: {} });
            setForSave(objId);
        }

        // Retroactively populate the index with existing objects
        await populateIndexWithExistingObjects(typeName, fieldName, objId);
    }

    this.getAllObjectIds = async function () {
        // Get all object IDs from both cache and disk storage
        const diskObjectIds = await storageStrategy.listAllObjects();
        const cacheObjectIds = Object.keys(cache);

        // Combine both lists and remove duplicates
        const allObjectIds = [...new Set([...diskObjectIds, ...cacheObjectIds])];
        return allObjectIds;
    }

    async function populateIndexWithExistingObjects(typeName, fieldName, indexId) {
        try {
            // Get all object IDs from both cache and storage
            const allObjectIds = await self.getAllObjectIds();

            // Filter objects to only include those that belong to the specific type
            const typeRelatedIds = allObjectIds.filter(id => {
                // if id is lowercase, return false
                if (id === id.toLowerCase()) {
                    return false;
                }

                const typeNameUpper = typeName.toUpperCase();
                const idUpper = id.toUpperCase();

                // Check if ID starts with type name followed by a dot (e.g., "TICKET.1", "USER.123")
                if (idUpper.startsWith(typeNameUpper + ".")) {
                    return true;
                }

                // Check if ID exactly matches type name (for singleton objects)
                if (idUpper === typeNameUpper) {
                    return true;
                }

                return false;
            });

            let index = await loadWithCache(indexId);
            let indexUpdated = false;

            for (const objectId of typeRelatedIds) {
                try {
                    const obj = await loadWithCache(objectId, true);

                    if (obj && obj[fieldName] !== undefined) {
                        // Check if this object already exists in the index
                        if (index.ids[obj[fieldName]] === undefined) {
                            // Check for conflicts - if value already exists for different object
                            const existingObjectId = index.ids[obj[fieldName]];
                            if (existingObjectId && existingObjectId !== objectId) {
                                console.warn(`Index conflict: Field ${fieldName} value ${obj[fieldName]} already exists for object ${existingObjectId}, skipping object ${objectId}`);
                                continue;
                            }
                            index.ids[obj[fieldName]] = objectId;
                            indexUpdated = true;

                        }
                    }
                } catch (error) {
                    // Skip objects that can't be loaded
                    console.debug(`Skipping object ${objectId} during index population: ${error.message}`);
                }
            }

            if (indexUpdated) {
                setForSave(indexId);
            }
        } catch (error) {
            console.error(`Error populating index ${typeName}.${fieldName}:`, error);
        }
    }

    this.getAllObjects = async function (typeName) {
        let fieldName = _indexes[typeName];
        let objId = makeSpecialName(typeName, fieldName);
        let obj = await loadWithCache(objId);
        return Object.values(obj.ids);
    }
    this.getAllObjectsData = async function (typeName, sortBy, start, end, descending) {
        let ids = await this.getAllObjects(typeName);
        return await this.loadObjectsRange(ids, sortBy, start, end, descending);
    }

    this.loadObjectsRange = async function (ids, sortBy, start, end, descending) {
        let objects = await Promise.all(ids.map(id => this.loadObject(id)));
        if (sortBy) {
            objects.sort((a, b) => {
                const aVal = a[sortBy];
                const bVal = b[sortBy];

                const aInvalid = aVal === undefined || aVal === null || typeof aVal === 'object';
                const bInvalid = bVal === undefined || bVal === null || typeof bVal === 'object';

                if (aInvalid && bInvalid) return 0;
                if (aInvalid) return 1;
                if (bInvalid) return -1;

                let result;

                if (typeof aVal === 'string' && typeof bVal === 'string') {
                    result = aVal.localeCompare(bVal); // ascending by default
                } else {
                    result = aVal - bVal; // assumes numeric
                }

                return descending ? -result : result;
            });
        }
        return objects.slice(start, end);
    }

    this.getObjectByField = async function (typeName, fieldName, fieldValue, allowMissing) {
        if (!fieldName) {
            fieldName = _indexes[typeName];
        }
        if (!fieldName) {
            return undefined;
        }

        let objId = makeSpecialName(typeName, fieldName);
        let index = await loadWithCache(objId);
        let indexValueAsId = index.ids[fieldValue];
        if (indexValueAsId === undefined) {
            return undefined;
        }
        return await self.loadObject(indexValueAsId, allowMissing);
    }

    this.createGrouping = async function (groupingName, typeName, fieldName) {
        if (!_groupings[typeName]) {
            _groupings[typeName] = [];
        }
        _groupings[typeName].push({ groupingName, fieldName });

        let obj = await loadWithCache(groupingName, true);
        if (!obj) {
            await self.createObject(groupingName, { items: {} });
            setForSave(groupingName);
        }

        // Retroactively populate the grouping with existing objects
        await populateGroupingWithExistingObjects(typeName, fieldName, groupingName);
    }

    async function populateGroupingWithExistingObjects(typeName, fieldName, groupingName) {
        try {
            // Get all object IDs from both cache and storage
            const allObjectIds = await self.getAllObjectIds();

            // Filter objects that belong to this type
            const typeRelatedIds = allObjectIds.filter(id => {
                // if id is lowercase, return false
                if (id === id.toLowerCase()) {
                    return false;
                }

                const typeNameUpper = typeName.toUpperCase();
                const idUpper = id.toUpperCase();

                // Check if ID starts with type name followed by a dot (e.g. "USER.123")
                if (idUpper.startsWith(typeNameUpper + ".")) {
                    return true;
                }

                // Check if ID exactly matches type name (for singleton objects)
                if (idUpper === typeNameUpper) {
                    return true;
                }

                return false;
            });

            let grouping = await loadWithCache(groupingName);
            let groupingUpdated = false;

            for (const objectId of typeRelatedIds) {
                try {
                    const obj = await loadWithCache(objectId, true);
                    if (obj && obj[fieldName] !== undefined) {
                        const fieldValue = obj[fieldName];

                        // Initialize the array for this field value if it doesn't exist
                        if (!grouping.items[fieldValue]) {
                            grouping.items[fieldValue] = [];
                        }

                        // Add the object ID if it's not already in the grouping
                        if (grouping.items[fieldValue].indexOf(objectId) === -1) {
                            grouping.items[fieldValue].push(objectId);
                            groupingUpdated = true;

                        }
                    }
                } catch (error) {
                    // Skip objects that can't be loaded
                    console.debug(`Skipping object ${objectId} during grouping population: ${error.message}`);
                }
            }

            if (groupingUpdated) {
                setForSave(groupingName);
            }
        } catch (error) {
            console.error(`Error populating grouping ${groupingName}:`, error);
        }
    }

    this.getGroupingByField = async function (groupingName, fieldValue) {
        let grouping = await loadWithCache(groupingName);
        return grouping.items[fieldValue] || [];
    }

    this.getGroupingObjectsByField = async function (groupingName, fieldValue, sortBy, start, end, descending) {
        let grouping = await loadWithCache(groupingName);
        let ids = grouping.items[fieldValue];
        if (!ids) {
            return [];
        }
        return await this.loadObjectsRange(ids, sortBy, start, end, descending);
    }

    async function saveAll() {
        for (let id in modified) {
            delete modified[id];
            await storageStrategy.storeObject(id, cache[id]);
        }
    }

    let intervalId = setInterval(async function () {
        await saveAll();
    }, periodicInterval);

    this.shutDown = async function () {
        clearInterval(intervalId);
        await saveAll();
    }

    this.forceSave = async function () {
        await saveAll();
    }
}

module.exports = {
    getAutoSaverPersistence: async function (storageStrategy) {
        if (!storageStrategy) {
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
