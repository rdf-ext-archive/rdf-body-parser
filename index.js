const bodyParser = require('body-parser')
const formats = require('rdf-formats-common')()
const httpErrors = require('http-errors')
const rdf = require('rdf-ext')
const stringToStream = require('string-to-stream')
const Promise = require('bluebird')

function init (options) {
  options = options || {}

  // default options
  options.bodyParser = options.bodyParser || bodyParser.text({type: '*/*'})
  options.formats = options.formats || formats

  const sendGraph = function (graph, mediaType) {
    const res = this

    mediaType = res.req.accepts(mediaType)

    // express returns ['*/*'] if no match was found
    if (Array.isArray(mediaType)) {
      mediaType = undefined
    }

    mediaType = mediaType || res.req.accepts(options.formats.serializers.list()) || options.defaultMediaType

    if (!mediaType || typeof mediaType !== 'string') {
      return Promise.reject(new httpErrors.NotAcceptable('no serializer found'))
    }

    res.setHeader('Content-Type', mediaType + '; charset=utf-8')

    // directly process stream or convert dataset to stream
    const input = graph.readable ? graph : graph.toStream()

    const resStream = options.formats.serializers.import(mediaType, input)

    resStream.pipe(res)

    return new Promise((resolve, reject) => {
      res.on('finish', resolve)
      res.on('error', reject)
      resStream.on('error', reject)
    })
  }

  // middleware
  return (req, res, next) => {
    options.bodyParser(req, res, err => {
      res.graph = sendGraph

      if (err) {
        return next(err)
      }

      const mediaType = 'content-type' in req.headers ? req.headers['content-type'] : options.defaultMediaType

      // empty body
      if (typeof req.body === 'object' && Object.keys(req.body).length === 0) {
        return next()
      }

      const reqStream = options.formats.parsers.import(mediaType, stringToStream(req.body && req.body.toString()))
      // If no stream (possibly due to an unsupported content-type), then don't attempt to process any further.
      if (!reqStream) {
        return next()
      }

      rdf.dataset().import(reqStream).then((graph) => {
        req.graph = graph

        next()
      }).catch((err) => {
        next(err)
      })
    })
  }
}

init.attach = function (req, res, options) {
  if (req.graph && res.graph) {
    return Promise.resolve()
  }

  return Promise.promisify(init(options))(req, res)
}

module.exports = init
