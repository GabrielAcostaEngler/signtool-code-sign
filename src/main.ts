import * as core from '@actions/core';
import { exec } from 'child_process';
import { promises } from 'fs';
import path from 'path';
import util from 'util';
import { env } from 'process';

// Exec
const execAsync = util.promisify(exec);

// Internal paths
const certPath = `${env['TEMP']}\\certificate.pfx`;
const signtool = 'C:/Program Files (x86)/Windows Kits/10/bin/10.0.17763.0/x86/signtool.exe';

// Inputs
const folder = core.getInput('folder');
const recursive = core.getInput('recursive') === 'true';
const base64cert = core.getInput('certificate');
const password = core.getInput('cert-password');
const sha1 = core.getInput('cert-sha1');
const timestmpServer = core.getInput('timestamp-server');
const certDesc = core.getInput('cert-description');

// Supported files
const supportedFileExt = [
	'.dll',
	'.exe',
	'.sys',
	'.vxd',
	'.msix',
	'.msixbundle',
	'.appx',
	'.appxbundle',
	'.msi',
	'.msp',
	'.msm',
	'.cab',
	'.ps1',
	'.psm1'
];

/**
 * Validate workflow inputs.
 *
 */
function validateInputs(): boolean {
	if (folder.length === 0) {
		core.error('foler input must have a value.');
		return false;
	}

	if (base64cert.length === 0) {
		core.error('certificate input must have a value.');
		return false;
	}

	if (password.length === 0) {
		core.error('cert-password input must have a value.');
		return false;
	}

	if (sha1.length === 0) {
		core.error('cert-sha1 input must have a value.');
		return false;
	}

	if (password.length === 0) {
		core.error('Password must have a value.');
		return false;
	}

	return true;
}

/**
 * Wait for X seconds and retry when code signing fails.
 *
 * @param seconds amount of seconds to wait.
 */
function wait(seconds: number): unknown {
	if (seconds > 0) core.info(`Waiting for ${seconds} seconds.`);
	return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

/**
 * Create PFX Certification fiole  from base64 certification.
 *
 */
async function createCert(): Promise<boolean> {
	const cert = Buffer.from(base64cert, 'base64');

	core.info(`Creating PFX Certificate at path: ${certPath}`);
	await promises.writeFile(certPath, cert);

	return true;
}

/**
 * Add Certificate to the store using certutil.
 *
 */
async function addCertToStore(): Promise<boolean> {
	try {
		const command = `certutil -f -p ${password} -importpfx ${certPath}`;
		core.info(`Adding to store using "${command}" command`);

		const { stdout } = await execAsync(command);
		core.info(stdout);

		return true;
	} catch (error) {
		core.error(error.stdout);
		core.error(error.stderr);
		return false;
	}
}

/**
 * Sign file using signtool.
 *
 * @param file File to be signed.
 */
async function trySign(file: string): Promise<boolean> {
	const ext = path.extname(file);
	for (let i = 0; i < 5; i++) {
		await wait(i);
		if (supportedFileExt.includes(ext)) {
			try {
				let command = `"${signtool}" sign /sm /t ${timestmpServer} /sha1 "${sha1}"`;
				if (certDesc !== '')
					command = command.concat(` /d ${certDesc}`);

				command = command.concat(` "${file}"`);
				core.info(`Signing file: ${file}\nCommand: ${command}`);
				const signCommandResult = await execAsync(command);
				core.info(signCommandResult.stdout);


				var verifyCommand = `"${signtool}" verify /pa "${file}"`;
				core.info(`Verifying signing for file: ${file}\nCommand: ${verifyCommand}`);
				const verifyCommandResult = await execAsync(verifyCommand);
				core.info(verifyCommandResult.stdout);

				return true;
			} catch (error) {
				core.error(error.stdout);
				core.error(error.stderr);
			}
		}
	}
	return false;
}

/**
 * Sign all files in folder, this is done recursively if recursive == 'true'
 *
 */
async function signFiles(): Promise<void> {
	for await (const file of getFiles())
		await trySign(file);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Return files one by one to be signed.
 *
 */
async function* getFiles(): any {
	const files = await promises.readdir(folder);
	for (const file of files) {
		const fullPath = `${folder}/${file}`;
		const stat = await promises.stat(fullPath);
		if (stat.isFile()) {
			const ext = path.extname(file);
			if (supportedFileExt.includes(ext) || ext === '.nupkg')
				yield fullPath;
		} else if (stat.isDirectory && recursive)
			yield* getFiles();
	}
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function run(): Promise<void> {
	try {
		validateInputs();
		if ((await createCert()) && (await addCertToStore()))
			await signFiles();
	} catch (error) {
		core.setFailed(`Code Signing failed\nError: ${error}`);
	}
}

run();
