
function WordArrayToBytes(...wordArrays)
{
    let totalCount = 0;
    wordArrays.forEach(e => totalCount += e.sigBytes);

    const ret = new Uint8Array(totalCount);
    let totalIndex = 0;

    for (let i = 0; i < wordArrays.length; ++i)
    {
        const currentWordArray = wordArrays[i];
        const words = currentWordArray.words;
        const count = currentWordArray.sigBytes;

        let index = 0;
        let offset = 0;

        for (let j = 0; j < count; ++j)
        {
            ret[totalIndex++] = words[index] >> ((3 - offset) << 3) & 0xff;

            if (++offset === 4)
            {
                offset = 0;
                ++index;
            }
        }
    }

    return ret;
}

function BytesToWordArray(bytes)
{
    return new CryptoJS.lib.WordArray.init(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
}

function SHA512(data, type)
{
    let bytes;
    if (typeof data === "string")
        bytes = CryptoJS.enc.Utf8.parse(data);
    else
        bytes = BytesToWordArray(data);
    
    const result = CryptoJS.SHA512(bytes);
    switch ((type || "").toLowerCase())
    {
        case "bytes":
        case "binary":
            return WordArrayToBytes(result);
        case "word":
        case "words":
        case "wordarray":
            return result;
        case "base64":
        case "b64":
            return CryptoJS.enc.Base64.stringify(result);
        default:
            return CryptoJS.enc.Hex.stringify(result);
    }
}

function AES256Encrypt(message, passphrase)
{
    const result = CryptoJS.AES.encrypt(message, passphrase);
    return WordArrayToBytes(result.salt, result.ciphertext);
}

function AES256Decrypt(ciphertext_bytearray, passphrase)
{
    const salt = BytesToWordArray(ciphertext_bytearray.subarray(0, 8));
    const ciphertext = BytesToWordArray(ciphertext_bytearray.subarray(8));
    const cipherParams = CryptoJS.lib.CipherParams.create({ ciphertext: ciphertext, salt: salt });

    const ret = CryptoJS.AES.decrypt(cipherParams, passphrase);
    return ret.sigBytes > 0 ? WordArrayToBytes(ret) : null;
}

function AES256DecryptToText(ciphertext_bytearray, passphrase)
{
    const result = AES256Decrypt(ciphertext_bytearray, passphrase);
    return result.toString(CryptoJS.enc.Utf8);
}

function Scrypt(password)
{
    return new Promise(resolve =>
    {
        scrypt(password, "Stegoid",
        {
            N: 32768,
            r: 16,
            dkLen: 64,
            p: 2,
            interruptStep: 1000,
            encoding: "base64"
        }, resolve);
    });
}