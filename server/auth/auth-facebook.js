
// FACEBOOK
app.post('/auth/facebook',
  // Step 1. Exchange authorization code for access token.
  function (req, res, next) {
    var accessTokenUrl = 'https://graph.facebook.com/oauth/access_token';
    var params = {
      code: req.body.code,
      client_id: req.body.clientId,
      client_secret: config.FACEBOOK_SECRET,
      redirect_uri: req.body.redirectUri
    };

    request.get({ url: accessTokenUrl, qs: params, json: true }, function(err, response, accessToken) {
      if (response.statusCode !== 200) {
        res.status(500).send({ message: accessToken.error.message });
        return;
      }
      req.accessToken = qs.parse(accessToken);
      next();
    });
  },

  // Step 2. Retrieve profile information about the current user.
  function (req, res, next) {
    var graphApiUrl = 'https://graph.facebook.com/me';
    var accessToken = req.accessToken;

    request.get({ url: graphApiUrl, qs: accessToken, json: true }, function(err, response, profile) {
      if (response.statusCode !== 200) {
        res.status(500).send({ message: profile.error.message });
        return;
      }
      req.profile = profile;
      next();
    });
  },

  // Step 3a. Link user accounts.
  function (req, res, next) {
    if (!req.headers[authHeader]) {
      next();
      return;
    }
    var profile = req.profile;

    User.find({ where: { facebook: profile.id }}, function(err, users) {
      var user = users[0];
      if (user) {
        res.status(409).send({ message: 'There is already a Facebook account that belongs to you' });
        return;
      }
      var token = req.headers[authHeader].split(' ')[1];
      var payload = jwt.decode(token, config.TOKEN_SECRET);
      User.findById(payload.sub, function(err, user) {
        if (!user) {
          res.status(400).send({ message: 'User not found' });
          return;
        }
        user.facebook = profile.id;
        user.displayName = user.displayName || profile.name;
        user.save(function() {
          res.send({
            token: createToken(user),
            user: user
          });
        });
      });
    });
  },

  // Step 3b. Create a new user account or return an existing one.
  function (req, res, next) {
    var profile = req.profile;
    var filter = { or: [{ facebook: profile.id }, { email: profile.email }] };

    User.find({ where:  filter }, function(err, users) {
      var user = users[0];

      if (user) {
        if (!user.facebook) {
          user.facebook = profile.id;
          user.displayName = user.displayName || profile.name;
          user.save(function () {
            req.user = user;
            next();
          });
          return;
        }

        req.user = user;
        next();
        return;
      }

      User.create({
        displayName: profile.name,
        facebook: profile.id,
        email: profile.email,
        password: profile.id
      }, function (err, user) {
        if (err) {
          res.send(err);
          return;
        }
        req.user = user;
        next();
      });
    });
  },

  function sendAccessToken (req, res) {
    var user = req.user;

    user.createAccessToken(User.settings.ttl, function (err, token) {
      if (err) {
        res.send(err);
        return;
      }
      token.token = createToken(user);
      res.send(token);
    });
  });
