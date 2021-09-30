import * as core from '@actions/core'
import {exec} from 'child_process'
import {promises} from 'fs'
import path from 'path'
import {env} from 'process'
import util from 'util'

// Exec
const execAsync = util.promisify(exec)

// Internal paths
const certPath = `${env['TEMP']}\\certificate.pfx`
const signtool =
	'C:/Program Files (x86)/Windows Kits/10/bin/10.0.17763.0/x86/signtool.exe'

// Inputs
const coreFolder = core.getInput('folder')
const coreRecursive = core.getInput('recursive') === 'true'
const coreBase64cert = core.getInput('certificate')
const corePassword = core.getInput('cert-password')
const coreSha1 = core.getInput('cert-sha1')
const coreTimestampServer = core.getInput('timestamp-server')
const coreCertDesc = core.getInput('cert-description')

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
]

/**
 * Validate workflow inputs.
 *
 */
function validateInputs(): boolean {
	if (coreFolder.length === 0) {
		core.error('foler input must have a value.')
		return false
	}

	if (coreBase64cert.length === 0) {
		core.error('certificate input must have a value.')
		return false
	}

	if (corePassword.length === 0) {
		core.error('cert-password input must have a value.')
		return false
	}

	if (coreSha1.length === 0) {
		core.error('cert-sha1 input must have a value.')
		return false
	}

	if (corePassword.length === 0) {
		core.error('password must have a value.')
		return false
	}

	return true
}

/**
 * Wait for X seconds and retry when code signing fails.
 *
 * @param seconds amount of seconds to wait.
 */
function wait(seconds: number): unknown {
	if (seconds > 0) core.info(`waiting for ${seconds} seconds.`)
	return new Promise(resolve => setTimeout(resolve, seconds * 1000))
}

/**
 * Create PFX Certification fiole  from base64 certification.
 *
 */
async function createCert(): Promise<boolean> {
	const cert = Buffer.from(coreBase64cert, 'base64')

	core.info(`creating PFX Certificate at path: ${certPath}`)
	await promises.writeFile(certPath, cert)

	return true
}

/**
 * Add Certificate to the store using certutil.
 *
 */
async function addCertToStore(): Promise<boolean> {
	try {
		const command = `certutil -f -p ${corePassword} -importpfx ${certPath}`
		core.info(`adding to store using "${command}" command`)

		const {stdout} = await execAsync(command)
		core.info(stdout)

		return true
	} catch (error) {
		core.error(error.stdout)
		core.error(error.stderr)
		return false
	}
}

/**
 * Sign file using signtool.
 *
 * @param file File to be signed.
 */
async function trySign(file: string): Promise<boolean> {
	const ext = path.extname(file)
	for (let i = 0; i < 5; i++) {
		await wait(i)
		if (supportedFileExt.includes(ext)) {
			try {
				let command = `"${signtool}" sign /sm /t ${coreTimestampServer} /sha1 "${coreSha1}"`
				if (coreCertDesc !== '')
					command = command.concat(` /d "${coreCertDesc}"`)

				command = command.concat(` "${file}"`)
				core.info(`signing file: ${file}\nCommand: ${command}`)
				const signCommandResult = await execAsync(command)
				core.info(signCommandResult.stdout)

				const verifyCommand = `"${signtool}" verify /pa "${file}"`
				core.info(
					`verifying signing for file: ${file}\nCommand: ${verifyCommand}`
				)
				const verifyCommandResult = await execAsync(verifyCommand)
				core.info(verifyCommandResult.stdout)

				return true
			} catch (error) {
				core.error(error.stderr)
				core.error(error.stderr)
			}
		}
	}
	return false
}

/**
 * Sign all files in folder, this is done recursively if recursive == 'true'
 *
 */
async function signFiles(): Promise<void> {
	for await (const file of getFiles(coreFolder, coreRecursive))
		await trySign(file)
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Return files one by one to be signed.
 *
 */
async function* getFiles(folder: string, recursive: boolean): any {
	const files = await promises.readdir(folder)
	for (const file of files) {
		const fullPath = `${folder}/${file}`
		const stat = await promises.stat(fullPath)
		if (stat.isFile()) {
			const ext = path.extname(file)
			if (supportedFileExt.includes(ext) || ext === '.nupkg') yield fullPath
		} else if (stat.isDirectory() && recursive)
			yield* getFiles(fullPath, recursive)
	}
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function run(): Promise<void> {
	try {
		validateInputs()
		if ((await createCert()) && (await addCertToStore())) await signFiles()
	} catch (error) {
		core.setFailed(`code Signing failed\nError: ${error}`)
	}
}

run()
