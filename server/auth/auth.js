var request = require('request');
var qs = require('querystring');
var jwt = require('jwt-simple');
var moment = require('moment');

module.exports = function (app, config) {

  var User = app.models[config.USER_MODEL];

  var authHeader = config.AUTH_HEADER;

  function createToken (user) {
    var payload = {
      sub: user.id,
      iat: moment().unix(),
      exp: moment().add(14, 'days').unix()
    };
    return jwt.encode(payload, config.TOKEN_SECRET);
  }

};