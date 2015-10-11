
// FOURSQUARE
app.post('/auth/foursquare',
  // Step 1. Exchange authorization code for access token.
  function(req, res, next) {
    var accessTokenUrl = 'https://foursquare.com/oauth2/access_token';
    var formData = {
      code: req.body.code,
      client_id: req.body.clientId,
      client_secret: config.FOURSQUARE_SECRET,
      redirect_uri: req.body.redirectUri,
      grant_type: 'authorization_code'
    };

    request.post({ url: accessTokenUrl, form: formData, json: true }, function(err, response, body) {
      if (err) {
        res.status(500).send(err);
        return;
      }
      req.accessToken = body.access_token;
      next();
    });
  },

  // Step 2. Retrieve information about the current user.
  function (req, res, next) {
    var profileUrl = 'https://api.foursquare.com/v2/users/self';
    var params = {
      v: '20140806',
      oauth_token: req.accessToken
    };

    request.get({ url: profileUrl, qs: params, json: true }, function(err, response, profile) {
      if (err) {
        res.status(500).send(err);
        return;
      }
      req.profile = profile.response.user;
      next();
    });
  },

  // Step 3a. Link user accounts.
  function (req, res, next) {
    if (!req.headers[authHeader]) {
      next();
      return;
    }

    User.find({ where: { foursquare: profile.id }}, function(err, users) {
      var user = users[0];

      if (user) {
        return res.status(409).send({ message: 'There is already a Foursquare account that belongs to you' });
      }

      var token = req.headers[authHeader].split(' ')[1];
      var payload = jwt.decode(token, config.TOKEN_SECRET);
      User.findById(payload.sub, function(err, user) {
        if (!user) {
          return res.status(400).send({ message: 'User not found' });
        }
        user.foursquare = profile.id;
        user.displayName = user.displayName || profile.firstName + ' ' + profile.lastName;
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
    var filter = { or: [{ foursquare: profile.id }, { email: profile.email }] };

    User.find({ where: filter }, function(err, users) {
      var user = users[0];

      if (user) {
        if (!user.foursquare) {
          user.foursquare = profile.id;
          user.displayName = user.displayName || profile.firstName + ' ' + profile.lastName;
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
        displayName: profile.firstName + ' ' + profile.lastName,
        foursquare: profile.id,
        email: profile.email,
        password: profile.id
      }, function (err, user) {
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