const { PassThrough } = require('stream');
const {
  RequestValidator,
} = require('express-openapi-validator/dist/middlewares');
const { json } = require('express');
const { promisify } = require('util');

const {
  applyMetadata,
  getOpenapiSpecification,
} = require('@marmicode/openapi-utils');

const pluginName = '@marmicode/eg-openapi-request-validator';

module.exports = {
  version: '0.1.0',
  schema: {
    $id: `${pluginName}-plugin-schema`,
  },
  init: (pluginContext) =>
    pluginContext.registerPolicy({
      name: pluginName,
      schema: {
        $id: `${pluginName}-policy-schema`,
        type: 'object',
        properties: {
          openapiSpecPath: {
            type: 'string',
          },
        },
        required: ['openapiSpecPath'],
      },
      policy: ({ openapiSpecPath }) => {
        const validatorPromise = getOpenapiValidator(openapiSpecPath);

        return async (req, res, next) => {
          const validate = await validatorPromise;

          try {
            await parseReqJson(req, res);
          } catch {
            res.sendStatus(400);
            return;
          }

          try {
            await validate(req, res);
          } catch (err) {
            res.status(err.status);
            res.send({
              errors: err.errors,
            });
            return;
          }

          next();
        };
      },
    }),
};

async function parseReqJson(req, res) {
  /* Backup request stream. */
  req.egContext.requestStream = new PassThrough();
  req.pipe(req.egContext.requestStream);

  await promisify(json())(req, res);
}

async function getOpenapiValidator(openapiSpecPath) {
  const spec = await getOpenapiSpecification(openapiSpecPath);

  const validator = new RequestValidator(spec);

  return async (req, res) => {
    /* Add openapi metadata to request. */
    await applyMetadata({ spec, req, res });

    /* Validate request. */
    await promisify(validator.validate.bind(validator))(req, res);
  };
}
