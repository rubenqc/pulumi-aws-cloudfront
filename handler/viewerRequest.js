module.exports = {
  handler: async (event) => {
    const request = event.Records[0].cf.request;
    const isProd = true;
    const isAsset = request.uri.split('.').length > 1;

    if (request.uri.startsWith('/rubenqc') && !isAsset) {
      request.uri = '/index.html';
      return request;
    }

    return request;
  },
};
