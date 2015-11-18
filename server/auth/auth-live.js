
// LIVE
app.post('/auth/live',
  // Step 1. Exchange authorization code for access token.
  function(req, res, next) {
    var accessTokenUrl = 'https://login.live.com/oauth20_token.srf';
    var params = {
      code: req.body.code,
      client_id: req.body.clientId,
      client_secret: config.WINDOWS_LIVE_SECRET,
      redirect_uri: req.body.redirectUri,
      grant_type: 'authorization_code'
    };
    request.post(accessTokenUrl, { form: params, json: true }, function(err, response, data) {
      if (err) {
        res.status(500).send(err);
        return;
      }
      req.accessToken = data.access_token;
      next();
    })
  },

  // Step 2. Retrieve profile information about the current user.
  function(req, res, next) {
    var accessToken = req.accessToken;
    var profileUrl = 'https://apis.live.net/v5.0/me?access_token=' + accessToken;
    request.get({ url: profileUrl, json: true }, function(err, response, profile) {
      if (err) {
        res.status(500).send(err);
        return;
      }
      req.profile = profile;
      next();
    });
  },

  // Step 3a. Link user accounts.
  function(req, res, next) {
    if (!req.headers[authHeader]) {
      next();
      return;
    }
    var profile = req.profile;
    User.find({ where: { live: profile.id }}, function(err, users) {
      var user = users[0];

      if (user) {
        res.status(409).send({ message: 'There is already a Windows Live account that belongs to you' });
        return;
      }
      var token = req.headers[authHeader].split(' ')[1];
      var payload = jwt.decode(token, config.TOKEN_SECRET);
      User.findById(payload.sub, function(err, user) {
        if (!user) {
          res.status(400).send({ message: 'User not found' });
          return;
        }
        user.live = profile.id;
        user.displayName = user.name;
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
    var prifile = req.profile;
    var filter = { or: [{ live: profile.id }, { email: profile.email }] };

    User.find({ where: filter }, function(err, users) {
      var user = users[0];

      if (user) {
        if (!user.live) {
          user.live = profile.id;
          user.displayName = user.displayName || profile.name;
          user.save(function() {
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
        live: profile.id,
        email: profile.email,
        password: profile.id
      }, function (err, user) {
        if (err) {
          res.status(500).send(err);
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