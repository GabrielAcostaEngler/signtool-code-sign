import * as core from '@actions/core';
import { exec } from 'child_process';
import { promises } from 'fs';
import path from 'path';
import util from 'util';
import { env } from 'process';

// Exec
const execAsync = util.promisify(exec);

// Internal paths
const certPath = env['TEMP'] + '\\certificate.pfx';
const signtool = 'C:/Program Files (x86)/Windows Kits/10/bin/10.0.17763.0/x86/signtool.exe';

// Inputs
const folder = core.getInput('folder');
const recursive = core.getInput('recursive') == 'true';
const base64cert = core.getInput('certificate');
const password = core.getInput('cert-password');
const sha1 = core.getInput('cert-sha1');
const timestmpServer = core.getInput('timestamp-server');
const certDesc = core.getInput('cert-description');

// Supported files
const supportedFileExt = [
	'.dll', '.exe', '.sys', '.vxd',
	'.msix', '.msixbundle', '.appx',
	'.appxbundle', '.msi', '.msp',
	'.msm', '.cab', '.ps1', '.psm1'
];

/**
 * Validate workflow inputs.
 * 
 */
function validateInputs() {
	if (folder.length == 0) {
		console.log('foler input must have a value.');
		return false;
	}

	if (base64cert.length == 0) {
		console.log('certificate input must have a value.');
		return false;
	}

	if (password.length == 0) {
		console.log('cert-password input must have a value.');
		return false;
	}

	if (sha1.length == 0) {
		console.log('cert-sha1 input must have a value.');
		return false;
	}

	if (password.length == 0) {
		console.log('Password must have a value.');
		return false;
	}
}

/**
 * Wait for X seconds and retry when code signing fails.
 * 
 * @param seconds amount of seconds to wait.
 */
function wait(seconds: number) {
	if (seconds > 0)
		console.log(`Waiting for ${seconds} seconds.`);
	return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

/**
 * Create PFX Certification fiole  from base64 certification.
 * 
 */
async function createCert() {
	let cert = Buffer.from(base64cert, 'base64');

	console.log(`Creating PFX Certificate at path: ${certPath}`);
	await promises.writeFile(certPath, cert);
	return true;
}

/**
 * Add Certificate to the store using certutil.
 * 
 */
async function addCertToStore() {
	try {
		let command = `certutil -f -p ${password} -importpfx ${certPath}`;
		console.log(`Adding to store using "${command}" command`);

		let { stdout } = await execAsync(command);
		console.log(stdout);

		return true;
	} catch (error) {
		console.log(error.stdout);
		console.log(error.stderr);
		return false;
	}
}

/**
 * Sign file using signtool.
 * 
 * @param file File to be signed.
 */
async function trySign(file: string) {
	let ext = path.extname(file);
	for (let i = 0; i < 5; i++) {
		await wait(i);
		if (supportedFileExt.includes(ext)) {
			try {
				let command = `"${signtool}" sign /sm /t ${timestmpServer} /sha1 "${sha1}"`;
				if (certDesc != '')
					command.concat(` /d ${certDesc}`);

				command.concat(` ${file}`);
				console.log(`Signing file: ${file}\nCommand: ${command}`);

				let { stdout } = await execAsync(command);
				console.log(stdout);

				return true;
			} catch (error) {
				console.log(error.stdout);
				console.log(error.stderr);
			}
		}
	}
	return false;
}

/**
 * Sign all files in folder, this is done recursively if recursive == 'true'
 * 
 */
async function signFiles() {
	for await (const file of getFiles())
		await trySign(file);
}

/**
 * Return files one by one to be signed.
 * 
 */
async function* getFiles(): any {
	let files = await promises.readdir(folder);
	for (const file of files) {
		let fullPath = `${folder}/${file}`;
		let stat = await promises.stat(fullPath);
		if (stat.isFile()) {
			let ext = path.extname(file);
			if (supportedFileExt.includes(ext) || ext == '.nupkg')
				yield fullPath;
		}
		else if (stat.isDirectory && recursive)
			yield* getFiles();
	}
}

async function run(): Promise<void> {
	try {
		validateInputs();
		if (await createCert() && await addCertToStore())
			await signFiles();
	} catch (error) {
		core.setFailed(`Code Signing failed\nError: ${error}`);
	}
}

run();