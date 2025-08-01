/**
 * Deep equality function that handles nested objects and arrays
 * This provides deterministic comparison unlike JSON.stringify()
 * 
 * @param {any} obj1 - First object to compare
 * @param {any} obj2 - Second object to compare
 * @returns {boolean} - True if objects are deeply equal
 */
export function deepEqual(obj1, obj2) {
    // Reference equality (fast path)
    if (obj1 === obj2) {
        return true;
    }

    // Null/undefined handling
    if (obj1 == null || obj2 == null) {
        return obj1 === obj2;
    }

    // Type checking
    if (typeof obj1 !== typeof obj2) {
        return false;
    }

    // Primitive comparison
    if (typeof obj1 !== 'object') {
        return obj1 === obj2;
    }

    // Array vs Object distinction
    if (Array.isArray(obj1) !== Array.isArray(obj2)) {
        return false;
    }

    // Array comparison
    if (Array.isArray(obj1)) {
        if (obj1.length !== obj2.length) {
            return false;
        }
        for (let i = 0; i < obj1.length; i++) {
            if (!deepEqual(obj1[i], obj2[i])) {
                return false;
            }
        }
        return true;
    }

    // Object comparison (property order independent)
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length) {
        return false;
    }

    for (let key of keys1) {
        if (!keys2.includes(key)) {
            return false;
        }
        if (!deepEqual(obj1[key], obj2[key])) {
            return false;
        }
    }

    return true;
}