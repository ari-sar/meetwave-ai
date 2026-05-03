const crypto = require('crypto');

const generateHash = (data) => {
    return crypto.createHash('sha256').update(data).digest('hex');
};

const compareHash = (data, hash) => {
    return generateHash(data) === hash;
};

module.exports = {
    generateHash,
    compareHash
};
