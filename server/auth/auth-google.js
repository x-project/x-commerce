var request = require('request');

module.exports = function (app) {

  var User = app.models.User;

  var token_secret = process.env.TOKEN_SECRET_GOOGLE;

  var access_token_endpoint = 'https://accounts.google.com/o/oauth2/token';

  var api_endpoint = 'https://www.googleapis.com/plus/v1/people/me/openIdConnect';

  function fetch_token (params) {
    var defer = Promise.defer();

    var options = {
      url: access_token_endpoint,
      form: params,
      json: true
    };

    request.post(options, function (err, res, token) {
      if (err) {
        defer.reject(err);
        return;
      }
      if (res.statusCode !== 200) {
        defer.reject(res.body);
        return;
      }
      defer.resolve(token.access_token);
    });

    return defer.promise;
  }

  function fetch_profile (token) {
    var defer = Promise.defer();

    var options = {
      url: api_endpoint,
      headers: {
        Authorization: 'Bearer ' + token
      },
      json: true
    };

    request.get(options, function (err, res, profile) {
      if (err) {
        defer.reject(err);
        return;
      }
      if (res.statusCode !== 200) {
        defer.reject(res.body);
        return;
      }
      defer.resolve(profile);
    });

    return defer.promise;
  }

  function find_user (profile) {
    var defer = Promise.defer();
    var query = { where: { or: [{ google: profile.sub }, { email: profile.email }] } };

    User.findOne(query, function (err, user) {
      if (err) {
        defer.reject(err);
        return;
      }
      if (!user) {
        return create_user(profile);
      }

      user.google = profile.sub;
      user.profile_name = user.profile_name || profile.name;
      defer.resolve(user);
    });

    return defer.promise;
  }

  function create_user (profile) {
    var defer = Promise.defer();

    User.create({
      profile_name: profile.name,
      google: profile.sub,
      email: profile.email,
      password: profile.sub
    }, function (err, user) {
      if (err) {
        defer.reject(err);
        return;
      }

      user.google = profile.sub;
      user.profile_name = user.profile_name || profile.name;
      defer.resolve(user);
    });

    return defer.promise;
  }

  function update_user (user) {
    var defer = Promise.defer();

    user.save(function() {
      defer.resolve(user);
    });

    return defer.promise;
  }

  function create_token (user) {
    var defer = Promise.defer();

    user.createAccessToken(User.settings.ttl, function (err, token) {
      if (err) {
        defer.reject(err);
        return;
      }
      defer.resolve(token);
    });

    return defer.promise;
  }

  function auth (params) {
    var defer = Promise.defer();

    fetch_token(params)
      .then(fetch_profile)
      .then(find_user)
      .then(update_user)
      .then(create_token)
      .then(defer.resolve)
      .catch(defer.reject);

    return defer.promise;
  }

  app.post('/auth/google', function (req, res, next) {
    var params = {
      client_id: req.body.client_id,
      code: req.body.code,
      redirect_uri: req.body.redirect_uri,
      client_secret: token_secret,
      grant_type: 'authorization_code'
    };

    auth(params)
      .then(function (token) {
        res.send(token);
      })
      .catch(function (err) {
        res.status(500).send(err);
      });
  });

};