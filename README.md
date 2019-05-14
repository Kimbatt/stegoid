# Stegoid

Hide data in JPEG files https://kimbatt.github.io/stegoid/

### How it works
The data is stored in the DCT coefficients of the JPEG file. The last n bits of the DC value, and last few bits of the AC values are used (these can be set before hiding data in the image).  
If the input data is text, then it will be converted to bytes using utf-8 encoding.  
The first 32 blocks of the image are used to store the size of the data, and the next 32 blocks are used to store the options used when creating the image (the options can be found at the top of the main.js file).  
After these, the remaining bits are stored in the DC and AC values.  
The remaining bits in the image are filled with random data, to make the changes harder to notice.  
But before hiding these bits / bytes in the file, they are encrypted.
First, the length of the data, and the options are XOR-ed with the 0th and 1st 32-bit element (4 bytes) of the SHA512 hash of the password.  
Then, a key is derived from the password using scrypt (N: 32768, r: 16, p: 2, dkLen: 64). This key is in base64 format, which is used as a passphrase for encrypting the data with AES.

### Libraries used:
- [jpeg-js](https://github.com/eugeneware/jpeg-js)
- [crypto-js](https://github.com/brix/crypto-js)
- [setImmediate](https://github.com/YuzuJS/setImmediate)
- [scrypt-async-js](https://github.com/dchest/scrypt-async-js)
