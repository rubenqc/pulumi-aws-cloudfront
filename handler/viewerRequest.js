const redirectRules = require('redirectRules.json');

module.exports = {
  handler: async (event) => {
    const request = event.Records[0].cf.request;
    const isProd = true;
    const isAsset = request.uri.split('.').length > 1;

    if (!isAsset) {
      for (const redirectRule of redirectRules) {
        if (request.uri.startsWith(redirectRule.src)) {
          request.uri = redirectRule.dst;
          return request;
        }
      }
    }

    return request;
  },
};
