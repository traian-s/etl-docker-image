const unzip = require('yauzl')
const fs = require('fs')
const path = require('path')
const mkdirp = require('mkdirp')
const rimraf = require('rimraf')
const convert = require('xml-js')
const buildCourseData = require('./utils/buildCourseData')

const args = process.argv.slice(2)
const cartridge = args[0]

const cartridgeBasePath = './cartridges'
const cartridgeExtension = 'imscc'
const unpackFolder = './unpacked'
const outputFolder = './output'

const cartridgePath = `${cartridgeBasePath}/${cartridge}.${cartridgeExtension}`

const unpackArchive = async () =>
  new Promise((resolve, reject) => {
    const xmlFiles = []
    unzip.open(cartridgePath, { lazyEntries: true }, function (err, zipfile) {
      if (err) {
        throw err
      }
      zipfile.readEntry()
      zipfile.on('entry', function (entry) {
        if (/\/$/.test(entry.fileName)) {
          // Directory file names end with '/'.
          // Note that entires for directories themselves are optional.
          // An entry's fileName implicitly requires its parent directories to exist.
          mkdirp(path.join(unpackFolder, entry.fileName), (err) => {
            if (err) {
              reject()
            }
            // Iterate to next entry now this folder is processed
            zipfile.readEntry()
          })
        } else {
          // file entry
          if (entry.fileName.endsWith('.xml')) {
            mkdirp(
              path.join(unpackFolder, path.dirname(entry.fileName)),
              (err) => {
                if (err) {
                  reject()
                }
                zipfile.openReadStream(entry, function (err, readStream) {
                  if (err) throw err
                  readStream.pipe(
                    fs.createWriteStream(
                      path.join(unpackFolder, entry.fileName)
                    )
                  )
                  readStream.on('end', () => {
                    xmlFiles.push(path.join(unpackFolder, entry.fileName))
                    // Iterate to next entry now this file/folder is processed
                    zipfile.readEntry()
                  })
                  // readStream.pipe(somewhere)
                })
              }
            )
          } else zipfile.readEntry()
        }
      })
      zipfile.once('end', () => {
        zipfile.close()
        resolve(xmlFiles)
      })
    })
  })

const main = async () => {
  try {
    rimraf.sync(unpackFolder)
    const xmlFiles = await unpackArchive()
    const jsonData = []
    if (xmlFiles.length) {
      xmlFiles.forEach((file) => {
        const xml = fs.readFileSync(file)
        const json = convert.xml2js(xml, {
          alwaysArray: [
            'lomimscc:taxon',
            'item',
            'lom:classification',
            'lom:taxon',
          ],
          compact: true,
          spaces: 4,
          ignoreDeclaration: true,
          // ignoreAttributes: true,
          ignoreDoctype: true,
        })
        const identifier = file.split('/').pop().replace('.xml', '')
        if (json && identifier) {
          jsonData.push({ file: identifier, data: json })
        }
      })
    }
    const courseData = buildCourseData(...jsonData)
    if (courseData)
      mkdirp(outputFolder, (err) => {
        if (err) {
          reject()
        }
        const timestamp = Math.round(Date.now() / 1000)
        fs.writeFileSync(
          path.join(outputFolder, `${cartridge}-${timestamp}.json`),
          JSON.stringify(buildCourseData(...jsonData))
        )
      })
  } catch (err) {
    console.log(err)
  }
}

main()
