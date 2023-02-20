'use strict';

module.exports = {
  handler: async (event) => {
    const response = event.Records[0].cf.response;

    // Setting security headers
    response.headers['strict-transport-security'] = [
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubdomains; preload' },
    ];
    response.headers['x-content-type-options'] = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
    ];
    response.headers['x-frame-options'] = [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }];
    response.headers['x-xss-protection'] = [{ key: 'X-XSS-Protection', value: '1; mode=block' }];
    response.headers['referrer-policy'] = [{ key: 'Referrer-Policy', value: 'same-origin' }];

    return response;
  },
};
