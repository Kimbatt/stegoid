
/*

Options: 32 bits

first 3 bits (0, 1, 2): bitcount
    000: 1 bit
    001: 2 bits
    010: 3 bits
    011: 4 bits
    100: 5 bits
    etc

next 2 bits (3, 4): secondary bit threshold: how many most significant bits are preserved of the secondary coeffs
    00: 3 bits
    01: 4 bits
    10: 5 bits
    11: 6 bits
    

The other bits are unused for now

*/

const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d");
//canvas.style = "border: 2px solid red";
//document.getElementsByTagName("body")[0].appendChild(canvas);

let imageIsLoaded_encode = false;
let imageName_encode;

function FileSelected_EncodeImage(files)
{
    const encodeButton = document.getElementById("encode-file-button");
    encodeButton.disabled = true;
    
    const fileToHideButton = document.getElementById("encode-filetohidebutton");
    fileToHideButton.disabled = true;
    
    const errorText = document.getElementById("encode-error-text");
    errorText.style.display = "none";

    imageIsLoaded_encode = false;
    const file = files[0];
    document.getElementById("encode-selectedfilename").innerText = file.name;
    imageName_encode = file.name;

    const fr = new FileReader();
    fr.onload = function(ev)
    {
        const img = new Image();
        img.onload = function()
        {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            imageIsLoaded_encode = true;
        
            encodeButton.disabled = false;
            fileToHideButton.disabled = false;
        };

        img.onerror = function()
        {
            errorText.innerText = "Error decoding image file";
            errorText.style.display = "";
        };

        img.src = ev.target.result;
    };

    fr.readAsDataURL(file);
}

function DisableInputs(element, disable)
{
    const div = document.getElementById(element);
    div.querySelectorAll("input").forEach(e => e.disabled = disable);
    div.querySelectorAll("button").forEach(e => e.disabled = disable);
}

async function EncodeFile()
{
    if (!imageIsLoaded_encode)
        return;

    DisableInputs("encode-div", true);

    const spinner = document.getElementById("encode-spinner").style;
    spinner.visibility = "visible";
    spinner.opacity = "1";

    const quality = Number(document.getElementById("encode-image-quality-slider").value);
    const bitcount = Number(document.getElementById("encode-image-bitcount-slider").value);
    const secondaryBitThreshold = Number(document.getElementById("encode-image-threshold-slider").value);
    const textBytes = StringToBytes(document.getElementById("encode-textarea").value);

    await WaitFor(100); // need this for the animation to show up in firefox
    const data =
    {
        data: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
        width: canvas.width,
        height: canvas.height
    };

    await WaitUntilNextFrame();

    const password = document.getElementById("encode-password").value;
    const passwordHash = SHA512(password, "wordarray").words;

    const encryptedBytes = AES256Encrypt(BytesToWordArray(textBytes), password);
    const encryptedBits = ByteArrayToBits(encryptedBytes);

    let options = 0;
    options |= (bitcount - 1) & 7;
    options |= ((secondaryBitThreshold - 3) & 3) << 3;

    let encoded;
    try
    {
        encoded = await encode(data, quality, encryptedBits, options, passwordHash);
    }
    catch (e)
    {
        const errorText = document.getElementById("encode-error-text");
        errorText.style.display = "";
        errorText.innerText = "Error: " + e;
    }

    DisableInputs("encode-div", false);

    if (encoded !== undefined)
        SaveJpeg(encoded.data, imageName_encode);
        
    spinner.visibility = "hidden";
    spinner.opacity = "0";
}

const saveJpegLink = document.createElement("a");
saveJpegLink.style.display = "none";
document.body.appendChild(saveJpegLink);
function SaveJpeg(data, name)
{
    const idx = name.lastIndexOf(".");
    if (idx !== -1)
        name = name.substring(0, idx) + ".jpg";
    else
        name += ".jpg";
    
    saveJpegLink.download = name;

    const blob = new Blob([data], {type: "image/jpeg"});
    if (window.navigator.msSaveOrOpenBlob)
        window.navigator.msSaveOrOpenBlob(blob, name);
    else
    {
        const url = window.URL.createObjectURL(blob);
        saveJpegLink.href = url;
        saveJpegLink.click();

        window.URL.revokeObjectURL(url);
    }
}

function StringToBytes(text)
{
    const ret = [];
    for (let i = 0; i < text.length; ++i)
    {
        let charcode = text.charCodeAt(i);
        if (charcode < 0x80)
            ret.push(charcode);
        else if (charcode < 0x800)
        {
            ret.push(0xc0 | (charcode >> 6));
            ret.push(0x80 | (charcode & 0x3f));
        }
        else if (charcode < 0xd800 || charcode >= 0xe000)
        {
            ret.push(0xe0 | (charcode >> 12));
            ret.push(0x80 | ((charcode >> 6) & 0x3f));
            ret.push(0x80 | (charcode & 0x3f));
        }
        else
        {
            ++i;
            charcode = 0x10000 + (((charcode & 0x3ff) << 10) | (text.charCodeAt(i) & 0x3ff));
            ret.push(0xf0 | (charcode >> 18));
            ret.push(0x80 | ((charcode >> 12) & 0x3f));
            ret.push(0x80 | ((charcode >> 6) & 0x3f));
            ret.push(0x80 | (charcode & 0x3f));
        }
    }
    
    return ret;
}

function BytesToString(byteArray)
{
    const ret = [];
    for (let i = 0; i < byteArray.length; ++i)
    {
        let charcode = byteArray[i];
        if (charcode >= 0x80)
        {
            let bytecount = -1;
            for (let j = 7; j >= 0; --j)
            {
                if ((charcode >> j) & 1)
                    ++bytecount;
                else
                    break;
            }
            
            if (i + bytecount >= byteArray.length)
                return null;
            
            charcode &= (1 << (6 - bytecount)) - 1; 
            
            for (let j = 0; j < bytecount; ++j)
            {
                charcode <<= 6;
                let currentByte = byteArray[++i];
                if ((currentByte & 0x80) != 0x80)
                    return null;
                
                charcode |= currentByte & 0x3f;
            }
        }
        
        ret.push(String.fromCodePoint(charcode));
    }
    
    return ret.join("");
}

function ByteArrayToBits(bytes)
{
    const ret = new Array(bytes.length * 8);
    let index = 0;
    for (let i = 0; i < bytes.length; ++i)
    {
        const byte = bytes[i];

        for (let j = 0; j < 8; ++j)
            ret[index++] = ((byte >> j) & 1) === 1;
    }

    return ret;
}

let imageIsLoaded_decode = false;
let decodedImageData = undefined;
function FileSelected_DecodeImage(files)
{
    imageIsLoaded_decode = false;
    decodedImageData = undefined;

    document.getElementById("decode-textarea").value = "";

    const file = files[0];
    const fileNameDiv = document.getElementById("decode-selectedfilename");
    fileNameDiv.innerText = "Decoding JPEG format";
    const spinner = document.getElementById("decode-spinner").style;
    spinner.visibility = "visible";
    spinner.opacity = "1";

    const decodeButton = document.getElementById("decode-file-button");
    decodeButton.disabled = true;
    
    const errorText = document.getElementById("decode-error-text");
    errorText.style.display = "none";

    const fr = new FileReader();
    fr.onload = async function(ev)
    {
        try
        {
            decodedImageData = await decode(new Uint8Array(ev.target.result));
            imageIsLoaded_decode = true;
        }
        catch (e)
        {
            decodedImageData = undefined;
            errorText.innerText = "Cannot decode image: " + e;
            errorText.style.display = "";
            console.log("ex");
        }

        fileNameDiv.innerText = file.name;
        spinner.visibility = "hidden";
        spinner.opacity = "0";
        
        if (imageIsLoaded_decode)
            decodeButton.disabled = false;
    };

    fr.readAsArrayBuffer(file);
}

function DecodeFile()
{
    const errorText = document.getElementById("decode-error-text");
    const textarea = document.getElementById("decode-textarea");
    textarea.value = "";

    try
    {
        textarea.value = TryDecodeFile();
        errorText.style.display = "none";
    }
    catch (e)
    {
        errorText.innerText = "Cannot extract data from image: " + e;
        errorText.style.display = "";
    }
}

function TryDecodeFile()
{
    const blocks = decodedImageData;
    const password = document.getElementById("decode-password").value;
    const passwordHash = SHA512(password, "wordarray").words;

    const rowcount = blocks[0].length;
    const colcount = blocks[0][0].length;

    let embedDataLength = 0;

    function* GetDataBlock()
    {
        for (let rowIndex = 0; rowIndex < rowcount; ++rowIndex)
        {
            for (let colIndex = 0; colIndex < colcount; ++colIndex)
            {
                for (let channelIndex = 0; channelIndex < 3; ++channelIndex)
                    yield blocks[channelIndex][rowIndex][colIndex];
            }
        }

        throw "unexpected end of file\neither the password is wrong, or the file does not contain any embedded data";
    }

    const dataBlockIterator = GetDataBlock();

    for (let i = 0; i < 32; ++i)
    {
        const currentData = dataBlockIterator.next().value;
        const bit = (currentData[0] & 1) !== 0;

        embedDataLength |= bit << i;
    }

    embedDataLength ^= passwordHash[0];

    if (embedDataLength === 0)
        throw "the file does not contain any embedded data";

    //console.log(embedDataLength);
    embedDataLength = embedDataLength >>> 0; // int32 to uint32
    embedDataLength *= 8; // bytes to bits

    let options = 0;
    for (let i = 0; i < 32; ++i)
    {
        const currentData = dataBlockIterator.next().value;
        const bit = (currentData[0] & 1) !== 0;

        options |= bit << i;
    }

    options ^= passwordHash[1];

    const bitcount = (options & 7) + 1;
    const acBitThreshold = ((options >> 3) & 3) + 3;
    //console.log(options);

    function* GetNextBit()
    {
        while (true)
        {
            const currentDataBlock = dataBlockIterator.next().value;
            for (let i = 0; i < bitcount; ++i)
                yield (currentDataBlock[0] >> i) & 1;

            for (let i = 1; i < 64; ++i)
            {
                const bitcount = BitCount(currentDataBlock[i]);
                const availableBits = bitcount - acBitThreshold;
                
                if (availableBits > 0)
                {
                    for (let j = 0; j < availableBits; ++j)
                        yield (currentDataBlock[i] >> j) & 1;
                }
            }
        }
    }

    let extractedData = [];
    let currentExtractedByte = 0;
    let bitIndex = 0;

    const bitIterator = GetNextBit();

    for (let i = 0; i < embedDataLength; ++i)
    {
        const bit = bitIterator.next().value;

        currentExtractedByte |= bit << bitIndex;
        ++bitIndex;
        if (bitIndex === 8)
        {
            bitIndex = 0;
            extractedData.push(currentExtractedByte);
            currentExtractedByte = 0;
        }
    }

    const decryptedDataBytes = AES256Decrypt(new Uint8Array(extractedData), password);
    if (decryptedDataBytes === null)
        throw "wrong password";

    const resultText = BytesToString(WordArrayToBytes(decryptedDataBytes));
    if (resultText === null)
        throw "the decoded text is not a valid utf-8 string (maybe the password is wrong)";
    
    return resultText;
}