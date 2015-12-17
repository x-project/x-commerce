var request = require('request');

module.exports = function (app) {

  var Customer = app.models.Customer;

  var access_token_endpoint = 'https://accounts.google.com/o/oauth2/token';

  var api_endpoint = 'https://www.googleapis.com/plus/v1/people/me/openIdConnect';


  var services = {};

  function get_service (name) {
    return new Promise(function (resolve, reject) {
      if (name in services) {
        resolve(services[name]);
        return;
      }
      var filter = {where: { name: name }};
      app.models.Service.findOne(filter, function (err, service) {
        if (err) {
          reject(err);
          return;
        }
        services[name] = service;
        resolve(service);
      });
    });
  }


  function fetch_token (params) {
    return new Promise(function (resolve, reject) {
      var options = {
        url: access_token_endpoint,
        form: params,
        json: true
      };

      request.post(options, function (err, res, token) {
        if (err) {
          reject(err);
          return;
        }
        if (res.statusCode !== 200) {
          reject(res.body);
          return;
        }
        resolve(token.access_token);
      });
    });

  }

  function fetch_profile (token) {
    return new Promise(function (resolve, reject) {
      var options = {
        url: api_endpoint,
        headers: {
          Authorization: 'Bearer ' + token
        },
        json: true
      };

      request.get(options, function (err, res, profile) {
        if (err) {
          reject(err);
          return;
        }
        if (res.statusCode !== 200) {
          reject(res.body);
          return;
        }
        resolve(profile);
      });
    });
  }

  function fetch_user (profile) {
    return new Promise(function (resolve, reject) {
      var query = { where: { or: [{ google: profile.sub }, { email: profile.email }] } };

      Customer.findOne(query, function (err, user) {
        if (err) {
          reject(err);
          return;
        }
        if (!user) {
          return create_user(profile);
        }
        if (user.google == undefined) {
          return update_user(profile, user);
        }
        if (user.google !== profile.sub) {
          reject(new Error('user just connected via another Google account'));
          return;
        }
        resolve(user);
      });
    });
  }

  function create_user (profile) {
    return new Promise(function (reject, resolve) {
      var full_name = profile.name.split(' ');
      Customer.create({
        first_name: full_name[0],
        last_name: full_name[1],
        google: profile.sub,
        email: profile.email,
        password: profile.sub
      }, function (err, user) {
        if (err) {
          reject(err);
          return;
        }
        resolve(user);
      });
    });
  }

  function update_user (profile, user) {
    return new Promise(function (reject, resolve) {
      user.google = profile.sub;
      user.profile_name = user.profile_name || profile.name;
      user.save(function (err) {
        if (err) {
          reject(err);
          return;
        }
        resolve(user);
      });
    });
  }

  function create_token (user) {
    return new Promise(function (reject, resolve) {
      user.createAccessToken(Customer.settings.ttl, function (err, token) {
        if (err) {
          reject(err);
          return;
        }
        var _token = JSON.parse(JSON.stringify(token));
        var _user = JSON.parse(JSON.stringify(user));
        delete _user.password;
        _user.id = _token.userId;
        _token.user = _user;
        resolve(_token);
      });
    });
  }

  function auth (params) {
    return new Promise(function (reject, resolve) {
      fetch_token(params)
        .then(fetch_profile)
        .then(fetch_user)
        .then(create_token)
        .then(resolve)
        .catch(reject);
    });
  }

  app.post('/auth/google', function (req, res, next) {
    get_service('google').then(function (service) {
      var params = {
        client_id: req.body.client_id,
        code: req.body.code,
        redirect_uri: req.body.redirect_uri,
        client_secret: service.private_key,
        grant_type: 'authorization_code'
      };

      auth(params)
        .then(function (token) {
          res.send(token);
        })
        .catch(function (err) {
          res.status(500).send(err);
        });
    }).catch(function (err) {
      res.status(500).send(err);
    });
  });

};