function convertToBase36Id(prefix, numericValue) {
    const alphanumericChars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (numericValue === 0) return '0';

    let base36Result = '';
    let currentValue = numericValue;

    while (currentValue > 0) {
        const modulus = currentValue % 36;
        base36Result = alphanumericChars[modulus] + base36Result;
        currentValue = Math.floor(currentValue / 36);
    }
    prefix = prefix.toUpperCase().substring(0,3);
    return ""+ prefix+"."+base36Result;
}



const CONST_NORMALISATION = 1000000;
function MathMoney(){
    this.add = function(a,b){
        return Math.round((a + b) * CONST_NORMALISATION) / CONST_NORMALISATION;
    }

    this.sub = function(a,b){
        return Math.round((a - b) * CONST_NORMALISATION) / CONST_NORMALISATION;
    }

    this.mul = function(a,b){
        return Math.round((a * b) * CONST_NORMALISATION) / CONST_NORMALISATION;
    }

    this.div = function(a,b){
        return Math.round((a / b) * CONST_NORMALISATION) / CONST_NORMALISATION;
    }

    this.normalise  = function(a){
        return Math.round(a * CONST_NORMALISATION) / CONST_NORMALISATION;
    }

    this.roundPoints = function(points){
        return checkPoints(Math.floor(points * CONST_NORMALISATION) / CONST_NORMALISATION);
    }
}


/**
 * Converts a decimal integer to its base-36 representation,
 * using the characters 0-9 and A-Z.
 * @param {number} number - The decimal integer to convert.
 * @returns {string} - The base-36 representation of the number.
 */
function convertToBase36(number) {
    //const alphanumericChars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const alphanumericChars = 'X1234567890VURKLSTWEJCZIDMBNQOYFAGHP';  //bijective obfuscation of base36
    if (number === 0) return 'X';

    let base36Result = '';
    let currentValue = number;

    while (currentValue > 0) {
        const modulus = currentValue % 36;
        base36Result = alphanumericChars[modulus] + base36Result;
        currentValue = Math.floor(currentValue / 36);
    }
    return base36Result;
}

/**
 * Transforms a decimal integer into the format XXX-XXX,
 * using base-36 encoding (digits and letters).
 * Pads with zeros at the end to reach 6 total characters.
 * @param {number} number - The number to transform.
 * @param prefix
 * @returns {string} - The formatted string in the form UXXX-XXXX.
 */
function transformToAccountID(number, prefix ) {
    if(!prefix){
        prefix = "U";
    }
    let base36Value = convertToBase36(number);
    base36Value = base36Value.padStart(7, 'X'); // pad with zeros at the end
    let res = prefix + base36Value;
    return res;
}

function getFullName(str, prefix) {
    if(!str.startsWith(prefix)) {
        throw new Error("Invalid user name " + str);
    }
    if(str.length === 8) {
        return str;
    }
    else {
        let str2 = str.slice(1);
        str2 = str2.padStart(7, 'X'); // pad with zeros at the end
        return prefix + str2;
    }
}

function getShortName(inputString, prefix) {
    if(inputString.length !== 8 && inputString.startsWith(prefix)) {
        throw new Error("Invalid user name " + inputString);
    }
    let str = inputString.slice(2);
    str = str.replace(/^X+/, '')
    return prefix + str;
}

function parseThresholds(thresholds) {
    let parsedThresholds = [];
    for (let threshold of thresholds) {
        if (typeof threshold !== "string") {
            throw new Error("Invalid threshold " + threshold);
        }
        const [n1, n2] = threshold.split(':').map(Number);
        parsedThresholds.push({threshold: n1, value: n2});
    }
    return parsedThresholds;
}

/**
 * Distributes a total reward R among a set of contributions
 * using a sublinear exponent alpha in (0,1).
 *
 * reward_i = (c_i^alpha / Σ_j c_j^alpha) * R
 *
 * @param {number[]} contributions - Array of numeric contributions (c_i).
 * @param {number} alpha - Exponent, 0 < alpha < 1.
 * @param {number} totalReward - Total reward to distribute.
 * @returns {number[]} - Rewards distributed to each contributor.
 */
function computeStakeSublinear(contributions, alpha) {
    // 1. Compute sum of c_i^alpha
    const sumAlpha = contributions.reduce((acc, c) => acc + Math.pow(c, alpha), 0);

    // 2. Compute each individual reward
    return contributions.map(c => {
        const numerator = Math.pow(c, alpha);
        return (numerator / sumAlpha) ;
    });
}

function computePercent(amountsDict){
    let sum = 0;
    for(let key in amountsDict){
        sum += amountsDict[key];
    }
    let result = {};
    for(let key in amountsDict){
        result[key] = amountsDict[key] / sum ;
    }
    return result;
}


module.exports = {
    convertToBase36Id,
    MathMoney : new MathMoney(),
    getFullName,
    getShortName,
    transformToAccountID,
    parseThresholds,
    computeStakeSublinear,
    computePercent
}
