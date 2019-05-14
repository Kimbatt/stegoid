
/*

Options: 32 bits

bits 0, 1, 2: bitcount
    000: 1 bit
    001: 2 bits
    010: 3 bits
    011: 4 bits
    100: 5 bits
    etc

bits 3, 4: secondary bit threshold: how many most significant bits are preserved of the secondary coeffs
    00: 3 bits
    01: 4 bits
    10: 5 bits
    11: 6 bits

bit 5: data type
    0: text
    1: file
    

The other bits are unused for now

*/

const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d");
//canvas.style = "border: 2px solid red";
//document.getElementsByTagName("body")[0].appendChild(canvas);

let imageIsLoaded_encode = false;
let imageName_encode;
let selectedImageFile;
let selectedImageData;

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
    selectedImageFile = file;
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
            selectedImageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

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

let fileToHideBytes;
let isFileToHideLoading = false;
function FileSelected_EncodeFileToHide(files)
{
    if (isFileToHideLoading)
        return;

    const fileToHideNameDiv = document.getElementById("encode-selectedfiletohidename");
    fileToHideNameDiv.innerText = "";
    
    const fileChooserButton = document.getElementById("encode-filetohidebutton");
    fileChooserButton.disabled = true;
    isFileToHideLoading = true;
    fileToHideBytes = undefined;
    const file = files[0];
    
    const errorText = document.getElementById("encode-error-text");
    errorText.style.display = "none";

    if (file.size >= selectedImageFile.size)
    {
        errorText.style.display = "";
        errorText.innerText = "Error: file size is too big";
        return;
    }

    const fileNameBytes = StringToBytes(file.name);
    if (fileNameBytes.length > 255)
    {
        errorText.style.display = "";
        errorText.innerText = "Error: file name is too long";
        return;
    }

    const fileNameLength = fileNameBytes.length;
    
    const fr = new FileReader();
    fr.onload = function(ev)
    {
        const fileBytes = new Uint8Array(ev.target.result);
        const finalBytes = new Uint8Array(5 + fileNameBytes.length + fileBytes.length);
        finalBytes[0] = fileNameLength;
        finalBytes.set(fileNameBytes, 1);
        finalBytes.set(fileBytes, fileNameBytes.length + 1);

        fileToHideBytes = finalBytes;
        isFileToHideLoading = false;
        fileChooserButton.disabled = false;

        fileToHideNameDiv.innerText = file.name;
    };

    fr.onerror = () =>
    {
        isFileToHideLoading = false;
        fileChooserButton.disabled = false;
    };

    fr.readAsArrayBuffer(file);
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

    const dataType = document.getElementById("encode-type-radio-text").checked ? "text" : "file";
    const errorText = document.getElementById("encode-error-text");

    const quality = Number(document.getElementById("encode-image-quality-slider").value);
    const bitcount = Number(document.getElementById("encode-image-bitcount-slider").value);
    const secondaryBitThreshold = Number(document.getElementById("encode-image-threshold-slider").value);
    let dataBytes;
    
    if (dataType === "text")
    {
        dataBytes = StringToBytes(document.getElementById("encode-textarea").value);
        if (dataBytes.length === 0)
        {
            errorText.style.display = "";
            errorText.innerText = "Error: text is empty";
            return;
        }
    }
    else
    {
        if (fileToHideBytes === undefined)
        {
            errorText.style.display = "";

            if (isFileToHideLoading)
                errorText.innerText = "Error: the selected file is still loading, try again in a few seconds";
            else
                errorText.innerText = "Error: no file selected to hide";

            return;
        }
        else
            dataBytes = fileToHideBytes;
    }

    errorText.style.display = "none";
    DisableInputs("encode-div", true);
    const spinner = document.getElementById("encode-spinner").style;
    ToggleSpinner(spinner, true);

    const data =
    {
        data: selectedImageData,
        width: canvas.width,
        height: canvas.height
    };

    await WaitUntilNextFrame();

    const password = document.getElementById("encode-password").value;
    const passwordHash = SHA512(password, "wordarray").words;
    const passwordScrypt = await Scrypt(password);

    const encryptedBytes = AES256Encrypt(BytesToWordArray(dataBytes), passwordScrypt);
    const encryptedBits = ByteArrayToBits(encryptedBytes);

    let options = 0;
    options |= (bitcount - 1) & 7;
    options |= ((secondaryBitThreshold - 3) & 3) << 3;
    options |= (dataType === "text" ? 0 : 1) << 5;

    let encoded;
    try
    {
        encoded = await encode(data, quality, encryptedBits, options, passwordHash);
    }
    catch (e)
    {
        errorText.style.display = "";
        errorText.innerText = "Error: " + e;
    }

    DisableInputs("encode-div", false);

    if (encoded !== undefined)
        SaveJpeg(encoded.data, imageName_encode);

    ToggleSpinner(spinner, false);
}

function ToggleSpinner(spinnerStyle, on)
{
    spinnerStyle.visibility = on ? "visible" : "hidden";
    spinnerStyle.opacity = on ? 1 : 0;
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

    const blob = new Blob([data], {type: "image/jpeg"});
    if (window.navigator.msSaveOrOpenBlob)
        window.navigator.msSaveOrOpenBlob(blob, name);
    else
    {
        const url = window.URL.createObjectURL(blob);
        saveJpegLink.download = name;
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

const saveExtractedFileLink = document.createElement("a");
saveExtractedFileLink.style.display = "none";
document.body.appendChild(saveExtractedFileLink);

let imageIsLoaded_decode = false;
let decodedImageData = undefined;
function FileSelected_DecodeImage(files)
{
    DisableInputs("decode-div", true);
    imageIsLoaded_decode = false;
    decodedImageData = undefined;

    document.getElementById("decode-textarea").value = "";

    const file = files[0];
    const fileNameDiv = document.getElementById("decode-selectedfilename");
    fileNameDiv.innerText = "Decoding JPEG format";
    const spinner = document.getElementById("decode-spinner").style;
    ToggleSpinner(spinner, true);

    document.getElementById("decode-result-text").style.display = "none";
    document.getElementById("decode-result-file").style.display = "none";
    document.getElementById("decode-result-before").style.display = "";

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
        }

        fileNameDiv.innerText = file.name;
        
        if (imageIsLoaded_decode)
            decodeButton.disabled = false;

        ToggleSpinner(spinner, false);
        DisableInputs("decode-div", false);
    };

    fr.onerror = function()
    {
        ToggleSpinner(spinner, false);
        DisableInputs("decode-div", false);
    };

    fr.readAsArrayBuffer(file);
}

async function DecodeFile()
{
    DisableInputs("decode-div", true);

    const errorText = document.getElementById("decode-error-text");
    errorText.style.display = "none";

    const textarea = document.getElementById("decode-textarea");
    textarea.value = "";

    document.getElementById("decode-result-text").style.display = "none";
    document.getElementById("decode-result-file").style.display = "none";

    const spinner = document.getElementById("decode-extract-spinner").style;
    ToggleSpinner(spinner, true);

    let decodedBytes;
    let dataType;
    try
    {
        const decodedData = await TryDecodeFile();
        decodedBytes = decodedData[0];
        dataType = decodedData[1];
        errorText.style.display = "none";
    }
    catch (e)
    {
        errorText.innerText = "Cannot extract data from image: " + e;
        errorText.style.display = "";
        ToggleSpinner(spinner, false);
        DisableInputs("decode-div", false);
        return;
    }

    if (dataType === "text")
    {
        const resultText = BytesToString(decodedBytes);
        if (resultText === null)
        {
            errorText.innerText = "Error: the decoded text is not a valid utf-8 string (maybe the password is wrong)";
            errorText.style.display = "";
            return;
        }

        textarea.value = resultText;

        document.getElementById("decode-result-text").style.display = "";
        document.getElementById("decode-result-before").style.display = "none";
    }
    else // dataType === "file"
    {
        const fileNameLength = decodedBytes[0];

        const fileName = BytesToString(decodedBytes.subarray(1, 1 + fileNameLength));
        const fileBytes = decodedBytes.subarray(1 + fileNameLength);
        
        const blob = new Blob([fileBytes]);
        const downloadButton = document.getElementById("decoded-file-download");
        if (window.navigator.msSaveOrOpenBlob)
            downloadButton.onclick = () => window.navigator.msSaveOrOpenBlob(blob, fileName);
        else
        {
            const url = window.URL.createObjectURL(blob);
            saveExtractedFileLink.download = fileName;
            saveExtractedFileLink.href = url;
            downloadButton.onclick = () => saveExtractedFileLink.click();
        }

        const fileSize =decodedBytes.length - 1 - fileNameLength;
        let fileSizeStr;
        if (fileSize < 1024)
            fileSizeStr = fileSize + " bytes";
        else if (fileSize < 1048576)
            fileSizeStr = Math.round(fileSize / 1024) + " kB";
        else
            fileSizeStr = (fileSize / 1048576).toFixed(2) + " MB";

        document.getElementById("decoded-file-name").innerText = fileName + " (" + fileSizeStr + ")";

        document.getElementById("decode-result-file").style.display = "";
        document.getElementById("decode-result-before").style.display = "none";
    }
    
    ToggleSpinner(spinner, false);
    DisableInputs("decode-div", false);
}

async function TryDecodeFile()
{
    const blocks = decodedImageData;
    const password = document.getElementById("decode-password").value;
    const passwordHash = SHA512(password, "wordarray").words;
    const passwordScrypt = await Scrypt(password);

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
    const dataType = (((options >> 5) & 1) === 0) ? "text" : "file";

    await WaitUntilNextFrame();

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
    let counter = 0;
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

        if (++counter === 32768)
        {
            counter = 0;
            await WaitUntilNextFrame();
        }
    }

    const decryptedDataBytes = AES256Decrypt(new Uint8Array(extractedData), passwordScrypt);
    if (decryptedDataBytes === null)
        throw "wrong password";
    
    return [decryptedDataBytes, dataType];
}