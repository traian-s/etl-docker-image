const express = require('express')
const app = express()
const port = 3001
const convert = require('xml-js')
const fs = require('fs')
const buildCourseData = require('./utils/buildCourseData')

const LTI_RESOURCE = 'imsbasiclti_xmlv1p0'
const WEB_LINK_RESOURCE = 'imswl_xmlv1p3'

const parseXml = () => {
  return new Promise((resolve, reject) => {
    fs.readFile('./xml/imsmanifest.xml', function (err, data) {
      const json = convert.xml2js(data, {
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
      // console.log('to json ->', json)
      resolve(json)
    })
  })
}

app.get('/', async (req, res) => {
  try {
    const parsed = await parseXml()
    // const courseData = buildCourseData(parsed)
    // res.end(JSON.stringify(parsed, null, 4))
    // res.end(JSON.stringify(courseData, null, 4))
    res.end(JSON.stringify({status: "success"}))
  } catch (err) {
    console.log(err)
    res.end(JSON.stringify(err, Object.getOwnPropertyNames(err)))
  }
})

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`)
})
