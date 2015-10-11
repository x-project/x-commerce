
// GOOGLE

app.post('/auth/google',

  // Step 1. Exchange authorization code for access token.
  function(req, res, next) {
    var accessTokenUrl = 'https://accounts.google.com/o/oauth2/token';
    var params = {
      code: req.body.code,
      client_id: req.body.clientId,
      client_secret: config.GOOGLE_SECRET,
      redirect_uri: req.body.redirectUri,
      grant_type: 'authorization_code'
    };

    request.post(accessTokenUrl, { json: true, form: params }, function(err, response, token) {
      if (response.statusCode !== 200) {
        res.status(500).send(err);
        return;
      }
      var accessToken = token.access_token;
      req.accessToken = accessToken;
      next();
    });
  },

  // Step 2. Retrieve profile information about the current user.
  function (req, res, next) {
    var peopleApiUrl = 'https://www.googleapis.com/plus/v1/people/me/openIdConnect';
    var accessToken = req.accessToken;
    var headers = { Authorization: 'Bearer ' + accessToken };
    request.get({ url: peopleApiUrl, headers: headers, json: true }, function(err, response, profile) {
      if (response.statusCode !== 200) {
        res.status(500).send(err);
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
    User.find({ where: { google: profile.sub } }, function(err, users) {
      var user = users[0];
      if (user) {
        res.status(409).send({ message: 'There is already a Google account that belongs to you' });
        return;
      }

      var token = req.headers[authHeader].split(' ')[1];
      var payload = jwt.decode(token, config.TOKEN_SECRET);
      User.findById(payload.sub, function(err, user) {
        if (!user) {
          res.status(400).send({ message: 'User not found' });
          return;
        }
        user.google = profile.sub;
        user.displayName = user.displayName || profile.name;
        user.save(function() {
          res.send({
            // token: createToken(user),
            user: user
          });
        });
      });
    });
  },

  // Step 3b. Create a new user account or return an existing one.
  function (req, res, next) {
    var profile = req.profile;
    var filter = { or: [{ google: profile.sub }, { email: profile.email }] };

    User.find({ where: filter }, function(err, users) {
      var user = users[0];

      if (user) {
        if (!user.google) {
          user.google = profile.sub;
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
        google: profile.sub,
        email: profile.email,
        password: profile.sub
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

