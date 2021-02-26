

# Signtool-Code-Signing

This action will code sign files from the given folder, this can be done recursively if needed. It uses a base64 encoded PFX certificate to sign files by adding the certificate to the store and then use signtool to do the code signing.  


All inputs regarding the Certificate except `description` should be added via repository/organization secrets.

Thanks to [Dirk Lemstra](https://github.com/dlemstra/code-sign-action) for providing a base for me to create this action.

# Inputs

### `certificate`

**Required** The base64 encoded certificate.

### `cert-password`

**Required** Certificate Password. Used to add to the machine store. 

### `cert-sha1`

**Required** SHA1 hash for the certificate. You can obtain this from Microsoft Management Console after double clicking on your certificate (called Thumbprint).

### `cert-description`

**Optional** Add a desciption to the files being signed.

### `folder`

**Required** The folder that contains the libraries to sign.

### `recursive`

**Optional** Recursively search for DLL files.

### `timestamp-server`

**Optional** Url of the timestamp server.  Default is 'http://timestamp.verisign.com/scripts/timstamp.dll'

# Usage

```
runs-on: windows-latest
steps:
  uses: GabrielAcostaEngler/signtool-code-sign@master
  with:
    certificate: '${{ secrets.CERTIFICATE }}'
    cert-password: '${{ secrets.PASSWORD }}'
    cert-sha1: '${{ secrets.CERTHASH }}'
    cert-description: 'foo'
    folder: 'path/to/folder'
    recursive: true
    timestamp-server: 'http://timestamp.digicert.com'
```
# License

This project is released under the [MIT License](LICENSE)