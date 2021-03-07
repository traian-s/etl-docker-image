const convert = require('xml-js')
const fs = require('fs')
const get = require('lodash/get')
const camelCase = require('lodash/camelCase')
const path = require('path')

/**
 *  Given a metadata object will extract lom:classification pairs
 */
const extractKeyValuePairs = ({ metadata = {} }) => {
  let keyValuePairs = {}
  const classifications = get(metadata, ['lom:lom', 'lom:classification'])
  if (classifications && classifications.length) {
    classifications.forEach((classif) => {
      const taxonomies = get(classif, ['lom:taxonPath', 'lom:taxon'])
      if (taxonomies && taxonomies.length) {
        taxonomies.forEach((taxonomy) => {
          const key = get(taxonomy, ['lom:id', '_text'])
          const value = get(taxonomy, ['lom:entry', 'lom:string', '_text'])
          if (key && value) {
            keyValuePairs = { ...keyValuePairs, [camelCase(key)]: value }
          }
        })
      }
    })
  }

  return keyValuePairs
}

const extractTaxonomies = ({ metadata = {} }) => {
  const taxonomies = []
  const classifications = get(metadata, ['lom:lom', 'lom:classification'])
  if (classifications && classifications.length) {
    classifications.forEach((classif) => {
      const rawTaxonomies = get(classif, ['lom:taxonPath'])
      if (rawTaxonomies && rawTaxonomies.length) {
        rawTaxonomies.forEach((rawTaxonomy) => {
          const tax = get(rawTaxonomy, ['lom:source', 'lom:string', '_text'])
          if (tax) taxonomies.push(tax)
        })
      }
    })
  }

  return taxonomies
}

const extractKeywords = ({ metadata = {} }) => {
  let keywords = []
  const rawKeywords = get(metadata, [
    'lom:lom',
    'lom:general',
    'lom:keyword',
    'lom:string',
  ])
  if (rawKeywords && rawKeywords.length) {
    keywords = rawKeywords.map((keyword) => get(keyword, ['_text']))
    // keywords need to be injected in resource folders
  } else if (rawKeywords) {
    const singleKeyword = get(rawKeywords, ['_text'])
    if (singleKeyword) keywords.push(singleKeyword)
  }
  return keywords
}

const extractResource = (identifier, resourceFiles) => {
  try {
    const [{ data: jsonData }] = resourceFiles.filter(
      ({ file }) => file === identifier
    )

    const launchUrl = get(jsonData, [
      'cartridge_basiclti_link',
      'blti:launch_url',
      '_text',
    ])

    const title = get(jsonData, [
      'cartridge_basiclti_link',
      'blti:title',
      '_cdata',
    ])

    const searchString = launchUrl.split('?')[1] || ''

    const urlParams = new URLSearchParams(searchString)
    const resourceId = urlParams.get('custom_resource_id')

    return {
      [resourceId]: {
        resourceId,
        title,
        identifier,
      },
    }
  } catch (err) {
    return null
  }
}

const buildResources = (rawResources, resourceFiles) => {
  let resources = {}
  if (!rawResources || !rawResources.length) return null
  rawResources.forEach((resource) => {
    // const { _attributes: { type = '', identifier = '' } = {} } = resource
    const type = get(resource, ['_attributes', 'type'])
    const identifier = get(resource, ['_attributes', 'identifier'])
    const filePath = get(resource, ['file', '_attributes', 'href'])

    let res = extractResource(identifier, resourceFiles)
    if (res) {
      resources = { ...resources, ...res }
    }

    // if (type === LTI_RESOURCE) {
    // }
  })
  return resources
}

const buildProducts = ({ item: rawProducts }) => {
  if (!rawProducts || !rawProducts.length)
    throw new Error('Products information is malformed.')
  const isbns = []
  rawProducts.forEach((product) => {
    const id = get(product, [
      'metadata',
      '0',
      'lom:lom',
      'lom:general',
      'lom:identifier',
      'lom:entry',
      '_text',
    ])

    if (id) isbns.push(id)
  })

  return { isbns }
}

const buildResourceFolders = ({ item: rawFolders }, resourcesObject) => {
  const otherResources = []
  let resourceFolders = {}

  if (!rawFolders || !rawFolders.length) return null
  rawFolders.forEach((folder) => {
    const folderName = get(folder, ['title', '_cdata'])
    const identifierRef = get(folder, ['_attributes', 'identifierref'])
    if (identifierRef) {
      // This is a resource placed directly under the Resources folder
      const res = { ...folder }
      const identifier = get(res, ['_attributes', 'identifierref'])
      const keyValuePairs = extractKeyValuePairs(res)
      const keywords = extractKeywords(res)
      const taxonomies = extractTaxonomies(res)
      // Match the resource with the one in resources and expand it with
      // key-value pairs and keywords
      Object.keys(resourcesObject).forEach((id) => {
        if (resourcesObject[id].identifier === identifier) {
          otherResources.push(resourcesObject[id].resourceId)
          resourcesObject[id] = {
            ...resourcesObject[id],
            ...keyValuePairs,
            keywords,
            taxonomies,
          }
        }
      })
    } else if (folderName) {
      // This is a subfolder
      if (folder.item && folder.item.length) {
        // If it doesn't contain any resources then don't process it
        const resources = []

        folder.item.forEach((res) => {
          const identifier = get(res, ['_attributes', 'identifierref'])
          const keyValuePairs = extractKeyValuePairs(res)
          const keywords = extractKeywords(res)
          const taxonomies = extractTaxonomies(res)
          // Match the resource with the one in resources and expand it with
          // key-value pairs and keywords
          Object.keys(resourcesObject).forEach((id) => {
            if (resourcesObject[id].identifier === identifier) {
              resources.push(resourcesObject[id].resourceId)
              resourcesObject[id] = {
                ...resourcesObject[id],
                ...keyValuePairs,
                keywords,
                taxonomies,
              }
            }
          })
        })
        if (resources.length)
          resourceFolders = {
            ...resourceFolders,
            [camelCase(folderName)]: { title: folderName, resources },
          }
      }
    }
    if (otherResources.length)
      resourceFolders = {
        ...resourceFolders,
        uncategorized: {
          title: 'Other Resources',
          resources: otherResources,
        },
      }
  })

  return resourceFolders
}

const buildCourseData = (imsmanifest, ...resourceFiles) => {
  let resources
  let products
  let resourceFolders = {}
  // const course = {}
  const { data: manifestData } = imsmanifest

  const title = get(manifestData, [
    'manifest',
    'metadata',
    'lomimscc:lom',
    'lomimscc:general',
    'lomimscc:title',
    'lomimscc:string',
    '_text',
  ])

  const isbn = get(manifestData, [
    'manifest',
    'metadata',
    'lomimscc:lom',
    'lomimscc:general',
    'lomimscc:identifier',
    'lomimscc:entry',
    '_text',
  ])

  const courseItems = get(manifestData, [
    'manifest',
    'organizations',
    'organization',
    'item',
    0,
    'item',
    0,
    'item',
  ])
  const rawResources = get(manifestData, ['manifest', 'resources', 'resource'])

  resources = buildResources(rawResources, resourceFiles)

  courseItems.forEach((item) => {
    const itemTitle = get(item, ['title', '_cdata'])
    switch (itemTitle) {
      case 'Resources':
        const processedResources = buildResourceFolders(item, resources)
        if (processedResources)
          resourceFolders = {
            ...resourceFolders,
            resources: processedResources,
          }
        break
      case 'Tests':
        const processedTests = buildResourceFolders(item, resources)
        if (processedTests)
          resourceFolders = { ...resourceFolders, tests: processedTests }
        break
      case 'Products':
        products = buildProducts(item)
        break
      default:
        break
    }
  })

  return { title, isbn, resources, resourceFolders, products }
}

module.exports = buildCourseData
